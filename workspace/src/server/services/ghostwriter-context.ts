import { badRequest, notFound } from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type {
  CandidateKnowledgeBase,
  CompanyResearchNote,
  Job,
  ResumeProfile,
} from "@shared/types";
import * as jobsRepo from "../repositories/jobs";
import { getCandidateKnowledgeBase } from "./candidate-knowledge";
import { getCompanyResearchNoteForJob } from "./company-research";
import { buildGhostwriterSystemPrompt } from "./ghostwriter-prompt";
import { getProfile } from "./profile";
import { getWritingStyle, type WritingStyle } from "./writing-style";

export type GhostwriterEvidencePack = {
  targetRoleSummary: string;
  topFitReasons: string[];
  topEvidence: string[];
  biggestGaps: string[];
  recommendedAngle: string;
  forbiddenClaims: string[];
  toneRecommendation: string;
};

export type JobChatPromptContext = {
  job: Job;
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
  style: WritingStyle;
  systemPrompt: string;
  jobSnapshot: string;
  profileSnapshot: string;
  companyResearchSnapshot: string;
  evidencePack: GhostwriterEvidencePack;
  evidencePackSnapshot: string;
};

const MAX_JOB_DESCRIPTION = 4000;
const MAX_PROFILE_SUMMARY = 1200;
const MAX_SKILLS = 18;
const MAX_PROJECTS = 6;
const MAX_EXPERIENCE = 5;
const MAX_ITEM_TEXT = 320;
const MAX_PERSONAL_FACTS = 12;
const MAX_CUSTOM_PROJECTS = 8;
const MAX_EVIDENCE_LINES = 5;

const PLANNING_KEYWORDS = [
  "planning",
  "forecast",
  "forecasting",
  "demand",
  "supply chain",
  "logistics",
  "operations research",
  "inventory",
  "procurement",
  "warehouse",
  "scheduling",
  "optimization",
  "routing",
];

const ANALYTICS_KEYWORDS = [
  "analytics",
  "analysis",
  "python",
  "excel",
  "sql",
  "reporting",
  "dashboard",
  "automation",
  "decision support",
  "model",
  "modelling",
];

const COLLABORATION_KEYWORDS = [
  "stakeholder",
  "cross-functional",
  "coordination",
  "collaboration",
  "operations",
  "process",
  "support",
  "delivery",
  "execution",
];

const SENIORITY_KEYWORDS = [
  "lead",
  "manager",
  "senior",
  "principal",
  "head",
  "director",
  "specialist",
  "owner",
];

const DOMAIN_TOOLS = [
  "sap",
  "sap ibp",
  "kinaxis",
  "anaplan",
  "o9",
  "s&op",
  "erp",
  "power bi",
  "tableau",
];

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n");
}

function tokenize(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function collectProfileText(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
): string {
  return [
    profile.basics?.headline,
    profile.basics?.label,
    profile.basics?.summary,
    profile.sections?.summary?.content,
    ...(profile.sections?.skills?.items ?? []).flatMap((item) => [
      item.name,
      item.description,
      ...(item.keywords ?? []),
    ]),
    ...(profile.sections?.experience?.items ?? []).flatMap((item) => [
      item.company,
      item.position,
      item.location,
      item.summary,
    ]),
    ...(profile.sections?.projects?.items ?? []).flatMap((item) => [
      item.name,
      item.description,
      item.summary,
      ...(item.keywords ?? []),
    ]),
    ...(knowledgeBase.personalFacts ?? []).flatMap((item) => [
      item.title,
      item.detail,
    ]),
    ...(knowledgeBase.projects ?? []).flatMap((item) => [
      item.name,
      item.role,
      item.summary,
      item.impact,
      ...item.keywords,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildJobSnapshot(job: Job): string {
  const snapshot = {
    event: "job.completed",
    sentAt: new Date().toISOString(),
    job: {
      id: job.id,
      source: job.source,
      title: job.title,
      employer: job.employer,
      location: job.location,
      salary: job.salary,
      status: job.status,
      jobUrl: job.jobUrl,
      applicationLink: job.applicationLink,
      suitabilityScore: job.suitabilityScore,
      suitabilityReason: truncate(job.suitabilityReason, 600),
      tailoredSummary: truncate(job.tailoredSummary, 1200),
      tailoredHeadline: truncate(job.tailoredHeadline, 300),
      tailoredSkills: truncate(job.tailoredSkills, 1200),
      jobDescription: truncate(job.jobDescription, MAX_JOB_DESCRIPTION),
    },
  };

  return JSON.stringify(snapshot, null, 2);
}

function buildProfileSnapshot(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
): string {
  const summary =
    truncate(profile?.sections?.summary?.content, MAX_PROFILE_SUMMARY) ||
    truncate(profile?.basics?.summary, MAX_PROFILE_SUMMARY);

  const skills = (profile?.sections?.skills?.items ?? [])
    .slice(0, MAX_SKILLS)
    .map((item) => {
      const keywords = (item.keywords ?? []).slice(0, 8).join(", ");
      return `${item.name}${keywords ? `: ${keywords}` : ""}`;
    });

  const projects = (profile?.sections?.projects?.items ?? [])
    .filter((item) => item.visible !== false)
    .slice(0, MAX_PROJECTS)
    .map(
      (item) =>
        `${item.name} (${item.date || "n/a"}): ${truncate(item.summary, MAX_ITEM_TEXT)}`,
    );

  const experience = (profile?.sections?.experience?.items ?? [])
    .filter((item) => item.visible !== false)
    .slice(0, MAX_EXPERIENCE)
    .map(
      (item) =>
        `${item.position} @ ${item.company} (${item.date || "n/a"}): ${truncate(item.summary, MAX_ITEM_TEXT)}`,
    );

  const personalFacts = (knowledgeBase.personalFacts ?? [])
    .slice(0, MAX_PERSONAL_FACTS)
    .map((item) => `${item.title}: ${truncate(item.detail, MAX_ITEM_TEXT)}`);

  const customProjects = (knowledgeBase.projects ?? [])
    .slice(0, MAX_CUSTOM_PROJECTS)
    .map((item) =>
      compactJoin([
        `${item.name}${item.role ? ` (${item.role})` : ""}: ${truncate(item.summary, MAX_ITEM_TEXT)}`,
        item.impact ? `Impact: ${truncate(item.impact, MAX_ITEM_TEXT)}` : null,
        item.keywords.length > 0
          ? `Keywords: ${item.keywords.slice(0, 8).join(", ")}`
          : null,
      ]),
    );

  return compactJoin([
    `Name: ${profile?.basics?.name || "Unknown"}`,
    `Headline: ${truncate(profile?.basics?.headline || profile?.basics?.label, 200) || ""}`,
    profile?.basics?.location?.city || profile?.basics?.location?.region
      ? `Location: ${[profile?.basics?.location?.city, profile?.basics?.location?.region].filter(Boolean).join(", ")}`
      : null,
    summary ? `Summary:\n${summary}` : null,
    skills.length > 0 ? `Skills:\n- ${skills.join("\n- ")}` : null,
    projects.length > 0 ? `Projects:\n- ${projects.join("\n- ")}` : null,
    experience.length > 0 ? `Experience:\n- ${experience.join("\n- ")}` : null,
    personalFacts.length > 0
      ? `Shared personal facts:\n- ${personalFacts.join("\n- ")}`
      : null,
    customProjects.length > 0
      ? `Shared project notes:\n- ${customProjects.join("\n- ")}`
      : null,
  ]);
}

function buildCompanyResearchSnapshot(
  note: CompanyResearchNote | null,
): string {
  if (!note) return "";
  return compactJoin([
    `Company: ${note.company}`,
    note.source ? `Source: ${note.source}` : null,
    `Research summary: ${truncate(note.summary, 1200)}`,
  ]);
}

function getEvidenceCandidates(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
): string[] {
  const experience = (profile.sections?.experience?.items ?? [])
    .filter((item) => item.visible !== false)
    .map((item) =>
      compactJoin([
        `${item.position} @ ${item.company}`,
        truncate(item.summary, MAX_ITEM_TEXT),
      ]),
    );

  const projects = (profile.sections?.projects?.items ?? [])
    .filter((item) => item.visible !== false)
    .map((item) =>
      compactJoin([
        `${item.name}${item.date ? ` (${item.date})` : ""}`,
        truncate(item.summary || item.description, MAX_ITEM_TEXT),
      ]),
    );

  const personalFacts = (knowledgeBase.personalFacts ?? []).map((item) =>
    `${item.title}: ${truncate(item.detail, MAX_ITEM_TEXT)}`,
  );

  const customProjects = (knowledgeBase.projects ?? []).map((item) =>
    compactJoin([
      `${item.name}${item.role ? ` (${item.role})` : ""}`,
      truncate(item.summary, MAX_ITEM_TEXT),
      item.impact ? `Impact: ${truncate(item.impact, MAX_ITEM_TEXT)}` : null,
    ]),
  );

  return [...experience, ...projects, ...personalFacts, ...customProjects].filter(
    Boolean,
  );
}

function scoreEvidenceCandidate(candidate: string, jobTokens: Set<string>): number {
  const tokens = new Set(tokenize(candidate));
  let score = 0;
  for (const token of tokens) {
    if (jobTokens.has(token)) score += 2;
  }
  if (/python|excel|sql|forecast|planning|operations research|optimization/i.test(candidate)) {
    score += 2;
  }
  if (/intern|thesis|master|project|automation|reporting|analysis/i.test(candidate)) {
    score += 1;
  }
  return score;
}

function buildGhostwriterEvidencePack(args: {
  job: Job;
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
  companyResearchNote: CompanyResearchNote | null;
}): GhostwriterEvidencePack {
  const jobText = [
    args.job.title,
    args.job.employer,
    args.job.location,
    args.job.jobDescription,
    args.job.suitabilityReason,
    args.companyResearchNote?.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const profileText = collectProfileText(args.profile, args.knowledgeBase);
  const jobTokens = new Set(tokenize(jobText));

  const topFitReasons: string[] = [];

  if (
    containsKeyword(jobText, PLANNING_KEYWORDS) &&
    containsKeyword(profileText, PLANNING_KEYWORDS)
  ) {
    topFitReasons.push(
      "Planning and forecasting fit is credible, with relevant operations-research and logistics-planning evidence.",
    );
  }

  if (
    containsKeyword(jobText, ANALYTICS_KEYWORDS) &&
    containsKeyword(profileText, ANALYTICS_KEYWORDS)
  ) {
    topFitReasons.push(
      "Analytical decision-support work is a strong angle, especially where Python, Excel, reporting, or structured modelling matter.",
    );
  }

  if (
    containsKeyword(jobText, COLLABORATION_KEYWORDS) &&
    containsKeyword(profileText, COLLABORATION_KEYWORDS)
  ) {
    topFitReasons.push(
      "Cross-functional coordination and practical execution support are believable strengths for this candidate.",
    );
  }

  if (topFitReasons.length === 0) {
    topFitReasons.push(
      "The safest positioning is as an analytical, practical early-career candidate whose strongest value is structured problem solving and useful execution support.",
    );
  }

  const topEvidence = getEvidenceCandidates(args.profile, args.knowledgeBase)
    .map((candidate) => ({
      candidate,
      score: scoreEvidenceCandidate(candidate, jobTokens),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EVIDENCE_LINES)
    .map((item) => item.candidate);

  const biggestGaps: string[] = [];

  if (
    containsKeyword(jobText, SENIORITY_KEYWORDS) &&
    /intern|master|thesis|student|early-career/i.test(profileText)
  ) {
    biggestGaps.push(
      "The role appears more senior than the current profile, so the writing should stay modest and avoid implied ownership beyond the evidence.",
    );
  }

  for (const tool of DOMAIN_TOOLS) {
    if (jobText.includes(tool) && !profileText.includes(tool)) {
      biggestGaps.push(
        `Do not imply direct hands-on ${tool.toUpperCase()} experience unless the user later provides it explicitly.`,
      );
      break;
    }
  }

  if (/vp|vice president|director|executive|senior management/i.test(jobText)) {
    biggestGaps.push(
      "Avoid claiming deep senior-stakeholder leadership unless it is explicitly supported by the supplied profile context.",
    );
  }

  if (biggestGaps.length === 0) {
    biggestGaps.push(
      "Do not overstate domain seniority, ownership, or tool depth beyond what the supplied profile actually supports.",
    );
  }

  const targetRoleSummary = truncate(
    compactJoin([
      `${args.job.title} at ${args.job.employer}`,
      args.job.jobDescription
        ? `Role focus: ${args.job.jobDescription
            .split(/\n+/)
            .slice(0, 3)
            .join(" ")}`
        : null,
      args.companyResearchNote?.summary
        ? `Company context: ${args.companyResearchNote.summary}`
        : null,
    ]),
    900,
  );

  const recommendedAngle =
    topFitReasons[0] && topEvidence[0]
      ? `Lead with ${topFitReasons[0].toLowerCase()} Ground the case in evidence such as ${topEvidence[0]}. Keep the tone specific, modest, and employer-need driven.`
      : "Lead with the strongest evidence-backed fit and keep the tone direct, modest, and practical.";

  const forbiddenClaims = Array.from(
    new Set([
      ...biggestGaps.map((item) => item.replace(/^Do not /i, "Do not ")),
      "Do not invent domain ownership, metrics, or systems experience that is not visible in the supplied profile.",
      "Do not present thesis, project, or internship work as if it were already a senior full-time ownership role.",
    ]),
  ).slice(0, 5);

  const toneRecommendation = /denmark|copenhagen|dtu|aarhus|aalborg|odense/i.test(
    `${args.job.location ?? ""} ${profileText}`,
  )
    ? "Use Denmark-local tone: restrained, direct, modest, concrete, and employer-need driven."
    : "Use a direct, practical, evidence-backed tone with low fluff and disciplined claims.";

  return {
    targetRoleSummary,
    topFitReasons: topFitReasons.slice(0, 3),
    topEvidence: topEvidence.slice(0, 4),
    biggestGaps: biggestGaps.slice(0, 3),
    recommendedAngle,
    forbiddenClaims,
    toneRecommendation,
  };
}

function buildEvidencePackSnapshot(pack: GhostwriterEvidencePack): string {
  return compactJoin([
    `Target role summary: ${pack.targetRoleSummary}`,
    pack.topFitReasons.length > 0
      ? `Top fit reasons:\n- ${pack.topFitReasons.join("\n- ")}`
      : null,
    pack.topEvidence.length > 0
      ? `Top evidence:\n- ${pack.topEvidence.join("\n- ")}`
      : null,
    pack.biggestGaps.length > 0
      ? `Biggest gaps / caution points:\n- ${pack.biggestGaps.join("\n- ")}`
      : null,
    `Recommended angle: ${pack.recommendedAngle}`,
    pack.forbiddenClaims.length > 0
      ? `Forbidden claims:\n- ${pack.forbiddenClaims.join("\n- ")}`
      : null,
    `Tone recommendation: ${pack.toneRecommendation}`,
  ]);
}

export async function buildJobChatPromptContext(
  jobId: string,
): Promise<JobChatPromptContext> {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) {
    throw notFound("Job not found");
  }

  const style = await getWritingStyle();

  let profile: ResumeProfile = {};
  let knowledgeBase: CandidateKnowledgeBase = {
    personalFacts: [],
    projects: [],
    companyResearchNotes: [],
  };
  let companyResearchNote: CompanyResearchNote | null = null;
  try {
    profile = await getProfile();
  } catch (error) {
    logger.warn("Failed to load profile for job chat context", {
      jobId,
      error: sanitizeUnknown(error),
    });
  }

  try {
    knowledgeBase = await getCandidateKnowledgeBase();
  } catch (error) {
    logger.warn("Failed to load shared candidate knowledge for job chat", {
      jobId,
      error: sanitizeUnknown(error),
    });
  }

  try {
    companyResearchNote = await getCompanyResearchNoteForJob(jobId);
  } catch (error) {
    logger.warn("Failed to load company research for job chat", {
      jobId,
      error: sanitizeUnknown(error),
    });
  }

  const profileSnapshot = buildProfileSnapshot(profile, knowledgeBase);
  const systemPrompt = buildGhostwriterSystemPrompt(style, profile);
  const jobSnapshot = buildJobSnapshot(job);
  const companyResearchSnapshot =
    buildCompanyResearchSnapshot(companyResearchNote);
  const evidencePack = buildGhostwriterEvidencePack({
    job,
    profile,
    knowledgeBase,
    companyResearchNote,
  });
  const evidencePackSnapshot = buildEvidencePackSnapshot(evidencePack);

  if (!jobSnapshot.trim()) {
    throw badRequest("Unable to build job context");
  }

  logger.info("Built job chat context", {
    jobId,
    includesProfile: Boolean(profileSnapshot),
    contextStats: sanitizeUnknown({
      systemChars: systemPrompt.length,
      jobChars: jobSnapshot.length,
      profileChars: profileSnapshot.length,
      companyResearchChars: companyResearchSnapshot.length,
      evidencePackChars: evidencePackSnapshot.length,
    }),
  });

  return {
    job,
    profile,
    knowledgeBase,
    style,
    systemPrompt,
    jobSnapshot,
    profileSnapshot,
    companyResearchSnapshot,
    evidencePack,
    evidencePackSnapshot,
  };
}
