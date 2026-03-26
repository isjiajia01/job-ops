import { badRequest, notFound } from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { CandidateKnowledgeBase, Job, ResumeProfile } from "@shared/types";
import * as jobsRepo from "../repositories/jobs";
import { getCandidateKnowledgeBase } from "./candidate-knowledge";
import { buildGhostwriterSystemPrompt } from "./ghostwriter-prompt";
import { getProfile } from "./profile";
import { getWritingStyle, type WritingStyle } from "./writing-style";

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
  const systemPrompt = buildGhostwriterSystemPrompt(style, profile);
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
