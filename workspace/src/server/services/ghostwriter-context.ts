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

export type GhostwriterExperienceModule = {
  id: string;
  label: string;
  sourceType: "knowledge_project" | "profile_project" | "profile_experience";
  roleFamilyHints: string[];
  strongestClaims: string[];
  preferredFraming: string;
  supportSignals: string[];
  score: number;
};

export type GhostwriterEvidencePack = {
  targetRoleSummary: string;
  targetRoleFamily: string;
  voiceProfile: string[];
  topFitReasons: string[];
  topEvidence: string[];
  experienceFrames: string[];
  evidenceStory: string[];
  experienceBank: GhostwriterExperienceModule[];
  selectedNarrative: string[];
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
const MAX_WRITING_PREFERENCES = 8;
const MAX_EVIDENCE_LINES = 5;
const MAX_EXPERIENCE_FRAMES = 4;
const MAX_EXPERIENCE_BANK = 6;

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

const ROLE_FAMILY_KEYWORDS: Array<{
  family: string;
  keywords: string[];
}> = [
  {
    family: "planning-and-operations",
    keywords: [
      "planning",
      "forecast",
      "forecasting",
      "demand",
      "supply planning",
      "logistics",
      "operations",
      "routing",
      "scheduling",
    ],
  },
  {
    family: "analytics-and-decision-support",
    keywords: [
      "analytics",
      "analysis",
      "excel",
      "python",
      "sql",
      "reporting",
      "dashboard",
      "decision support",
      "business intelligence",
    ],
  },
  {
    family: "optimization-and-research",
    keywords: [
      "optimization",
      "optimisation",
      "operations research",
      "model",
      "modelling",
      "simulation",
      "heuristic",
      "algorithm",
    ],
  },
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
    ...(knowledgeBase.writingPreferences ?? []).flatMap((item) => [
      item.label,
      item.instruction,
      item.kind,
      item.strength,
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
        item.roleRelevance
          ? `Role relevance: ${truncate(item.roleRelevance, MAX_ITEM_TEXT)}`
          : null,
        item.keywords.length > 0
          ? `Keywords: ${item.keywords.slice(0, 8).join(", ")}`
          : null,
      ]),
    );

  const writingPreferences = (knowledgeBase.writingPreferences ?? [])
    .slice(0, MAX_WRITING_PREFERENCES)
    .map(
      (item) =>
        `${item.label} [${item.kind}/${item.strength}]: ${truncate(item.instruction, MAX_ITEM_TEXT)}`,
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
    writingPreferences.length > 0
      ? `Shared writing preferences:\n- ${writingPreferences.join("\n- ")}`
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

function getExperienceFrameCandidates(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
): string[] {
  const profileProjects = (profile.sections?.projects?.items ?? [])
    .filter((item) => item.visible !== false)
    .map((item) => {
      const lower =
        `${item.name} ${item.summary} ${item.description} ${(item.keywords ?? []).join(" ")}`.toLowerCase();
      const frame =
        /mover|last-mile|rolling-horizon|routing|delivery|thesis|optimization research/.test(
          lower,
        )
          ? "Frame as operations-linked optimisation work under real delivery constraints rather than a generic academic project."
          : /forecast|planning|optimization|decision support|analysis/.test(
                lower,
              )
            ? "Frame as practical planning and decision-support work with concrete operational constraints."
            : "Frame around the most concrete operational problem solved, not generic project language.";

      return compactJoin([
        `${item.name}${item.date ? ` (${item.date})` : ""}`,
        truncate(item.summary || item.description, MAX_ITEM_TEXT),
        `Preferred framing: ${frame}`,
      ]);
    });

  const knowledgeProjects = (knowledgeBase.projects ?? []).map((item) => {
    const lower =
      `${item.name} ${item.role ?? ""} ${item.summary} ${item.impact ?? ""} ${item.keywords.join(" ")}`.toLowerCase();
    const frame = /collaboration|mover/.test(lower)
      ? "Frame as a collaboration tied to real operations, not a standalone school exercise."
      : item.impact
        ? `Frame: ${truncate(item.impact, MAX_ITEM_TEXT)}`
        : "Frame with the most role-relevant operational angle first.";

    return compactJoin([
      `${item.name}${item.role ? ` (${item.role})` : ""}`,
      truncate(item.summary, MAX_ITEM_TEXT),
      frame,
      item.cvBullets?.length
        ? `Reusable evidence: ${item.cvBullets.slice(0, 2).join(" | ")}`
        : null,
    ]);
  });

  const preferenceFrames = (knowledgeBase.writingPreferences ?? [])
    .filter(
      (item) =>
        item.kind === "positioning" ||
        item.kind === "priority" ||
        item.kind === "guardrail",
    )
    .map(
      (item) => `${item.label}: ${truncate(item.instruction, MAX_ITEM_TEXT)}`,
    );

  return [...knowledgeProjects, ...profileProjects, ...preferenceFrames].filter(
    Boolean,
  );
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

  const personalFacts = (knowledgeBase.personalFacts ?? []).map(
    (item) => `${item.title}: ${truncate(item.detail, MAX_ITEM_TEXT)}`,
  );

  const customProjects = (knowledgeBase.projects ?? []).map((item) =>
    compactJoin([
      `${item.name}${item.role ? ` (${item.role})` : ""}`,
      truncate(item.summary, MAX_ITEM_TEXT),
      item.impact ? `Impact: ${truncate(item.impact, MAX_ITEM_TEXT)}` : null,
    ]),
  );

  return [
    ...experience,
    ...projects,
    ...personalFacts,
    ...customProjects,
  ].filter(Boolean);
}

function scoreEvidenceCandidate(
  candidate: string,
  jobTokens: Set<string>,
): number {
  const tokens = new Set(tokenize(candidate));
  let score = 0;
  for (const token of tokens) {
    if (jobTokens.has(token)) score += 2;
  }
  if (
    /python|excel|sql|forecast|planning|operations research|optimization/i.test(
      candidate,
    )
  ) {
    score += 2;
  }
  if (
    /intern|thesis|master|project|automation|reporting|analysis/i.test(
      candidate,
    )
  ) {
    score += 1;
  }
  return score;
}

function detectTargetRoleFamily(jobText: string): string {
  const ranked = ROLE_FAMILY_KEYWORDS.map((item) => ({
    family: item.family,
    score: item.keywords.filter((keyword) => jobText.includes(keyword)).length,
  })).sort((a, b) => b.score - a.score);

  return ranked[0] && ranked[0].score > 0
    ? ranked[0].family
    : "general-analytical";
}

function detectRoleFamilyHints(text: string): string[] {
  const lower = text.toLowerCase();
  return ROLE_FAMILY_KEYWORDS.filter((item) =>
    item.keywords.some((keyword) => lower.includes(keyword)),
  ).map((item) => item.family);
}

function inferCanonicalExperienceKey(text: string): string {
  const lower = text.toLowerCase();
  if (/mover|rolling-horizon|last-mile|dtu.*thesis|thesis.*mover/.test(lower)) {
    return "mover-thesis";
  }
  if (
    /business analysis intern|business analysis internship|reporting automation/.test(
      lower,
    )
  ) {
    return "business-analysis-internship";
  }
  if (/denmark flex planner|grid-aware ev|renewable siting/.test(lower)) {
    return "denmark-flex-planner";
  }
  if (/\bnu\b|swiftui|ios transit app/.test(lower)) {
    return "nu";
  }
  return lower.replace(/[^a-z0-9]+/g, "-").slice(0, 80);
}

function scoreRoleSpecificModule(args: {
  text: string;
  targetRoleFamily: string;
}): number {
  const lower = args.text.toLowerCase();
  let score = 0;

  if (args.targetRoleFamily === "planning-and-operations") {
    if (
      /mover|rolling-horizon|last-mile|routing|delivery|operational constraints|transport planner|logistics/.test(
        lower,
      )
    )
      score += 8;
    if (
      /denmark flex planner|scenario|decision-support tooling|municipality selection/.test(
        lower,
      )
    )
      score += 3;
    if (/business analysis internship|reporting automation/.test(lower))
      score -= 1;
    if (
      /support module rather than lead for planning|usually support module rather than lead for planning/.test(
        lower,
      )
    )
      score -= 3;
  }

  if (args.targetRoleFamily === "optimization-and-research") {
    if (
      /mover|thesis|optimization research|operations research|rolling-horizon|heuristic|re-optimization/.test(
        lower,
      )
    )
      score += 9;
    if (
      /mover|collaboration with mover|operations-linked collaboration/.test(
        lower,
      )
    )
      score += 4;
    if (
      /denmark flex planner|optimisation decision-support system|selection logic|explainable/.test(
        lower,
      )
    )
      score += 4;
    if (/business analysis internship|reporting automation/.test(lower))
      score -= 2;
  }

  if (args.targetRoleFamily === "analytics-and-decision-support") {
    if (
      /business analysis internship|reporting automation|reporting|excel|python|decision-ready|stakeholder/.test(
        lower,
      )
    )
      score += 9;
    if (
      /denmark flex planner|product-style frontend|end-to-end|decision-support artifact/.test(
        lower,
      )
    )
      score += 3;
    if (/mover|thesis|rolling-horizon|routing|delivery/.test(lower)) score -= 1;
    if (
      /support module for planning\/optimisation roles|lead module for planning|lead module for planning, optimisation, logistics/.test(
        lower,
      )
    )
      score -= 2;
  }

  if (
    /lead module for analytics|lead module for planning|lead module for logistics|lead module for optimisation/.test(
      lower,
    )
  ) {
    score += 3;
  }
  if (/support module/.test(lower) && !/lead module/.test(lower)) {
    score -= 1;
  }

  return score;
}

function dedupeExperienceBank(
  modules: GhostwriterExperienceModule[],
): GhostwriterExperienceModule[] {
  const seen = new Set<string>();
  const result: GhostwriterExperienceModule[] = [];
  for (const module of modules) {
    const key = inferCanonicalExperienceKey(
      [module.label, module.preferredFraming, ...module.strongestClaims].join(
        " ",
      ),
    );
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(module);
  }
  return result;
}

function buildExperienceBank(args: {
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
  jobTokens: Set<string>;
  targetRoleFamily: string;
}): GhostwriterExperienceModule[] {
  const modules: GhostwriterExperienceModule[] = [];

  for (const item of args.knowledgeBase.projects ?? []) {
    const raw = [
      item.name,
      item.role,
      item.summary,
      item.impact,
      item.roleRelevance,
      ...(item.keywords ?? []),
      ...((item.cvBullets ?? []).slice(0, 3) ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    const roleFamilyHints = detectRoleFamilyHints(raw);
    const strongestClaims = [
      ...((item.cvBullets ?? []).slice(0, 3) ?? []),
      item.summary,
      item.impact,
    ].filter(Boolean) as string[];
    const preferredFraming =
      /mover|collaboration|delivery|rolling-horizon|routing/i.test(raw)
        ? "Use this as operations-linked planning and optimisation work in a real delivery context."
        : item.roleRelevance?.trim() ||
          item.impact?.trim() ||
          "Lead with the most practical operational or decision-support angle.";
    const score =
      scoreEvidenceCandidate(raw, args.jobTokens) +
      (roleFamilyHints.includes(args.targetRoleFamily) ? 4 : 0) +
      scoreRoleSpecificModule({
        text: [item.name, raw].join(" "),
        targetRoleFamily: args.targetRoleFamily,
      }) +
      (/mover|thesis|delivery|planning|optimization/i.test(raw) ? 1 : 0);

    modules.push({
      id: `knowledge:${item.name}`,
      label: item.name,
      sourceType: "knowledge_project",
      roleFamilyHints,
      strongestClaims: strongestClaims.slice(0, 3),
      preferredFraming,
      supportSignals: [
        ...(item.keywords ?? []).slice(0, 5),
        ...(item.roleRelevance ? [item.roleRelevance] : []),
      ].slice(0, 5),
      score,
    });
  }

  for (const item of args.profile.sections?.projects?.items ?? []) {
    if (item.visible === false) continue;
    const raw = [
      item.name,
      item.description,
      item.summary,
      ...(item.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    const roleFamilyHints = detectRoleFamilyHints(raw);
    const strongestClaims = [item.summary, item.description].filter(
      Boolean,
    ) as string[];
    const preferredFraming =
      /delivery|routing|rolling-horizon|planning|optimization/i.test(raw)
        ? "Frame as a concrete planning/optimisation system rather than a generic school project."
        : "Frame around the clearest concrete problem solved.";
    const score =
      scoreEvidenceCandidate(raw, args.jobTokens) +
      (roleFamilyHints.includes(args.targetRoleFamily) ? 3 : 0) +
      scoreRoleSpecificModule({
        text: [item.name, raw].join(" "),
        targetRoleFamily: args.targetRoleFamily,
      });

    modules.push({
      id: `project:${item.id}`,
      label: item.name,
      sourceType: "profile_project",
      roleFamilyHints,
      strongestClaims: strongestClaims.slice(0, 3),
      preferredFraming,
      supportSignals: (item.keywords ?? []).slice(0, 5),
      score,
    });
  }

  for (const item of args.profile.sections?.experience?.items ?? []) {
    if (item.visible === false) continue;
    const raw = [item.company, item.position, item.location, item.summary]
      .filter(Boolean)
      .join(" ");
    const roleFamilyHints = detectRoleFamilyHints(raw);
    const strongestClaims = [
      `${item.position} @ ${item.company}`,
      item.summary,
    ].filter(Boolean) as string[];
    const preferredFraming =
      /reporting|excel|python|analysis|decision-ready/i.test(raw)
        ? "Use this as supporting evidence that you can turn analysis into practical decision support."
        : "Use this to show grounded execution and collaboration support.";
    const score =
      scoreEvidenceCandidate(raw, args.jobTokens) +
      (roleFamilyHints.includes(args.targetRoleFamily) ? 2 : 0) +
      scoreRoleSpecificModule({
        text: [`${item.position} @ ${item.company}`, raw].join(" "),
        targetRoleFamily: args.targetRoleFamily,
      });

    modules.push({
      id: `experience:${item.id}`,
      label: `${item.position} @ ${item.company}`,
      sourceType: "profile_experience",
      roleFamilyHints,
      strongestClaims: strongestClaims.slice(0, 3),
      preferredFraming,
      supportSignals: roleFamilyHints.slice(0, 4),
      score,
    });
  }

  return dedupeExperienceBank(modules.sort((a, b) => b.score - a.score)).slice(
    0,
    MAX_EXPERIENCE_BANK,
  );
}

function buildVoiceProfile(knowledgeBase: CandidateKnowledgeBase): string[] {
  const tonePrefs = (knowledgeBase.writingPreferences ?? [])
    .filter(
      (item) =>
        item.kind === "tone" ||
        item.kind === "phrase" ||
        item.kind === "guardrail" ||
        item.kind === "priority",
    )
    .sort((a, b) =>
      a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1,
    )
    .map(
      (item) => `${item.label}: ${truncate(item.instruction, MAX_ITEM_TEXT)}`,
    );

  return tonePrefs.slice(0, 6);
}

function buildSelectedNarrative(args: {
  targetRoleFamily: string;
  experienceBank: GhostwriterExperienceModule[];
}): string[] {
  const [lead, support, tertiary] = args.experienceBank;
  const lines: string[] = [];

  if (lead) {
    lines.push(`Lead module: ${lead.label} — ${lead.preferredFraming}`);
  }
  if (support) {
    lines.push(
      `Support module: ${support.label} — use it to reinforce the same ${args.targetRoleFamily} story without repeating the lead module.`,
    );
  }
  if (tertiary) {
    lines.push(
      `Optional third signal: ${tertiary.label} — use only if it sharpens credibility or range for this role.`,
    );
  }

  if (lines.length === 0) {
    lines.push(
      "No strong module detected; lead with the clearest evidence-backed example and keep the narrative modest.",
    );
  }

  return lines.slice(0, 4);
}

function buildEvidenceStory(args: {
  targetRoleFamily: string;
  topEvidence: string[];
  experienceFrames: string[];
}): string[] {
  const intro =
    args.targetRoleFamily === "planning-and-operations"
      ? "Lead with evidence that shows practical planning under operational constraints, then support it with analytics or automation work."
      : args.targetRoleFamily === "optimization-and-research"
        ? "Lead with optimisation and modelling work, then translate it into decision-support value for real operations."
        : args.targetRoleFamily === "analytics-and-decision-support"
          ? "Lead with analytical decision-support work, then reinforce it with planning or optimisation examples that make the analysis feel operationally grounded."
          : "Lead with the clearest evidence of structured problem solving and useful execution support.";

  const storyLines = [intro];
  if (args.topEvidence[0]) {
    storyLines.push(`Primary anchor: ${args.topEvidence[0]}`);
  }
  if (args.experienceFrames[0]) {
    storyLines.push(
      `Package the primary anchor like this: ${args.experienceFrames[0]}`,
    );
  }
  if (args.topEvidence[1]) {
    storyLines.push(`Supporting anchor: ${args.topEvidence[1]}`);
  }
  return storyLines.slice(0, 4);
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
  const targetRoleFamily = detectTargetRoleFamily(jobText);

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

  const experienceFrames = getExperienceFrameCandidates(
    args.profile,
    args.knowledgeBase,
  )
    .map((candidate) => ({
      candidate,
      score: scoreEvidenceCandidate(candidate, jobTokens),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EXPERIENCE_FRAMES)
    .map((item) => item.candidate);

  const voiceProfile = buildVoiceProfile(args.knowledgeBase);

  const experienceBank = buildExperienceBank({
    profile: args.profile,
    knowledgeBase: args.knowledgeBase,
    jobTokens,
    targetRoleFamily,
  });

  const selectedNarrative = buildSelectedNarrative({
    targetRoleFamily,
    experienceBank,
  });

  const evidenceStory = buildEvidenceStory({
    targetRoleFamily,
    topEvidence,
    experienceFrames,
  });

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
      ? `Lead with ${topFitReasons[0].toLowerCase()} Ground the case in evidence such as ${topEvidence[0]}${experienceFrames[0] ? ` and package it using framing such as ${experienceFrames[0]}.` : "."} Keep the tone specific, modest, and employer-need driven.`
      : "Lead with the strongest evidence-backed fit and keep the tone direct, modest, and practical.";

  const forbiddenClaims = Array.from(
    new Set([
      ...biggestGaps.map((item) => item.replace(/^Do not /i, "Do not ")),
      "Do not invent domain ownership, metrics, or systems experience that is not visible in the supplied profile.",
      "Do not present thesis, project, or internship work as if it were already a senior full-time ownership role.",
    ]),
  ).slice(0, 5);

  const toneRecommendation =
    /denmark|copenhagen|dtu|aarhus|aalborg|odense/i.test(
      `${args.job.location ?? ""} ${profileText}`,
    )
      ? "Use Denmark-local tone: restrained, direct, modest, concrete, and employer-need driven."
      : "Use a direct, practical, evidence-backed tone with low fluff and disciplined claims.";

  return {
    targetRoleSummary,
    targetRoleFamily,
    voiceProfile,
    topFitReasons: topFitReasons.slice(0, 3),
    topEvidence: topEvidence.slice(0, 4),
    experienceFrames: experienceFrames.slice(0, 4),
    evidenceStory: evidenceStory.slice(0, 4),
    experienceBank,
    selectedNarrative,
    biggestGaps: biggestGaps.slice(0, 3),
    recommendedAngle,
    forbiddenClaims,
    toneRecommendation,
  };
}

function buildEvidencePackSnapshot(pack: GhostwriterEvidencePack): string {
  return compactJoin([
    `Target role summary: ${pack.targetRoleSummary}`,
    `Target role family: ${pack.targetRoleFamily}`,
    pack.voiceProfile.length > 0
      ? `Voice profile:\n- ${pack.voiceProfile.join("\n- ")}`
      : null,
    pack.topFitReasons.length > 0
      ? `Top fit reasons:\n- ${pack.topFitReasons.join("\n- ")}`
      : null,
    pack.topEvidence.length > 0
      ? `Top evidence:\n- ${pack.topEvidence.join("\n- ")}`
      : null,
    pack.experienceFrames.length > 0
      ? `Preferred experience framing:\n- ${pack.experienceFrames.join("\n- ")}`
      : null,
    pack.evidenceStory.length > 0
      ? `Evidence story plan:\n- ${pack.evidenceStory.join("\n- ")}`
      : null,
    pack.selectedNarrative.length > 0
      ? `Selected narrative modules:\n- ${pack.selectedNarrative.join("\n- ")}`
      : null,
    pack.experienceBank.length > 0
      ? `Experience bank:\n- ${pack.experienceBank
          .map(
            (item) =>
              `${item.label} [${item.sourceType}; score=${item.score}] — ${item.preferredFraming}`,
          )
          .join("\n- ")}`
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
