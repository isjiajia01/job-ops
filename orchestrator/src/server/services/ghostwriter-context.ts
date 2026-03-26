import { badRequest, notFound } from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { CandidateKnowledgeBase, Job, ResumeProfile } from "@shared/types";
import * as jobsRepo from "../repositories/jobs";
import { getCandidateKnowledgeBase } from "./candidate-knowledge";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import { getProfile } from "./profile";
import {
  getWritingStyle,
  stripLanguageDirectivesFromConstraints,
  type WritingStyle,
} from "./writing-style";

export type JobChatPromptContext = {
  job: Job;
  style: WritingStyle;
  systemPrompt: string;
  jobSnapshot: string;
  profileSnapshot: string;
};

const MAX_JOB_DESCRIPTION = 4000;
const MAX_PROFILE_SUMMARY = 1200;
const MAX_SKILLS = 18;
const MAX_PROJECTS = 6;
const MAX_EXPERIENCE = 5;
const MAX_ITEM_TEXT = 320;
const MAX_PERSONAL_FACTS = 12;
const MAX_CUSTOM_PROJECTS = 8;

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n");
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

function buildSystemPrompt(
  style: WritingStyle,
  profile: ResumeProfile,
): string {
  const resolvedLanguage = resolveWritingOutputLanguage({
    style,
    profile,
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);
  const effectiveConstraints = stripLanguageDirectivesFromConstraints(
    style.constraints,
  );

  return compactJoin([
    "You are JobOps AI Copilot, a job-application writing assistant for a single job.",
    "Use only the provided job and profile context unless the user gives extra details.",
    "If details are missing, say what is missing before making assumptions.",
    "Avoid exposing private profile details that are unrelated to the user request.",
    'Always return valid JSON with this exact shape: {"response":"...","coverLetterDraft":null,"coverLetterKind":null,"resumePatch":null}.',
    "Do not return markdown fences or any text outside that JSON object.",
    'Put all user-visible chat text inside "response". Keep it concise, direct, and useful.',
    'When the user asks for a cover letter or application email, put the final ready-to-use document body in "coverLetterDraft". Keep "response" short and do not duplicate the whole document there.',
    'Use "coverLetterKind":"letter" for full cover letters and "coverLetterKind":"email" for short application emails. Otherwise return null.',
    'When the user asks to update the current tailored CV for this job, return a "resumePatch" object with any fields you want the system to apply automatically: "tailoredSummary", "tailoredHeadline", and "tailoredSkills". Leave untouched fields as null.',
    'When the user does not ask to update the CV, return "resumePatch": null.',
    "Treat current job tailoring fields as editable working draft state for this job.",
    "Follow the user's requested output language exactly when they specify one.",
    `When the user does not request a language, default to writing user-visible resume or application content in ${outputLanguage}.`,
    `When suggesting a headline or job title, preserve the original wording instead of translating it.`,
    "When writing CV or resume content, use standard resume voice with the subject implied unless the user explicitly asks for another style.",
    "When writing a cover letter, use natural first-person cover-letter voice.",
    "For cover letters, keep the draft targeted to the specific role and employer, usually within one page and 3-5 short paragraphs.",
    "For cover letters, explain why this role and employer are a fit and support that case with 2-3 concrete examples from the provided profile.",
    "For cover letters, do not repeat the resume line by line, do not use placeholders, and avoid generic praise or inflated enthusiasm.",
    "For cover letters, prefer a clear structure: brief opening, evidence-focused body, concise close.",
    "For this candidate, default to an early-career, analytical, practical, and modest voice rather than a senior or highly promotional tone.",
    "For this candidate, emphasize planning-oriented problem solving, operational analysis, reporting automation, Excel/Python-based decision support, and structured collaboration when supported by the profile.",
    "For this candidate, internships, thesis work, academic projects, and competition work are valid evidence and should be used confidently but without overclaiming.",
    "For Denmark-local cover letters, keep the tone direct, employer-need driven, and restrained rather than highly enthusiastic or self-promotional.",
    "For Denmark-local cover letters, prefer a local, non-template opening and avoid generic salutations when a more specific opening is possible.",
    "For Denmark-local cover letters, keep the closing short and useful, with more emphasis on how the candidate can contribute and less on formal courtesy language.",
    "Write with conviction and sincerity: concrete verbs, concrete evidence, and honest ambition.",
    "Avoid empty intensity. Do not use generic hype, vague passion claims, or inflated adjectives when a sharper concrete statement is possible.",
    "Prefer sentences that sound lived-in and specific over polished-but-generic recruiter language.",
    "Use concrete day-to-day detail from the supplied profile or job context when it makes the writing feel more lived-in and specific, but do not invent personal-life detail, stories, or unsupported facts.",
    'Avoid formulaic openings such as "I am writing to express my interest" unless the user explicitly asks for a more traditional letter style.',
    'Avoid stock motivation phrases such as "I am looking for a role where...", "This role fits me because...", or "I am excited to apply..." when a more concrete and specific opening is possible.',
    "Prefer openings that start from the work, planning problem, business need, or operating context rather than from generic motivation language.",
    "When useful, you may mention the current master's study at DTU and expected graduation timing only if it strengthens fit for the role.",
    `Writing style tone: ${style.tone}.`,
    `Writing style formality: ${style.formality}.`,
    effectiveConstraints
      ? `Writing constraints: ${effectiveConstraints}`
      : null,
    style.doNotUse ? `Avoid these terms: ${style.doNotUse}` : null,
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
  };
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

  const profileSnapshot = buildProfileSnapshot(profile, knowledgeBase);
  const systemPrompt = buildSystemPrompt(style, profile);
  const jobSnapshot = buildJobSnapshot(job);

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
    }),
  });

  return {
    job,
    style,
    systemPrompt,
    jobSnapshot,
    profileSnapshot,
  };
}
