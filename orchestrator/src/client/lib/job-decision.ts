import type { Job, JobListItem } from "@shared/types.js";

export type JobRecommendation =
  | "apply_now"
  | "tailor_and_apply"
  | "keep_warm"
  | "skip";

export interface JobDecisionBrief {
  recommendation: JobRecommendation;
  recommendationLabel: string;
  effortLabel: string;
  rationale: string;
  whyApply: string[];
  watchouts: string[];
}

const APPLY_NOW_THRESHOLD = 85;
const TAILOR_THRESHOLD = 70;
const KEEP_WARM_THRESHOLD = 55;

export function getJobRecommendation(
  job: Pick<Job, "status" | "suitabilityScore">,
): JobRecommendation {
  if (job.status === "skipped") return "skip";

  const score = job.suitabilityScore ?? 0;
  if (score >= APPLY_NOW_THRESHOLD) return "apply_now";
  if (score >= TAILOR_THRESHOLD) return "tailor_and_apply";
  if (score >= KEEP_WARM_THRESHOLD) return "keep_warm";
  return "skip";
}

export function getRecommendationMeta(recommendation: JobRecommendation): {
  label: string;
  effortLabel: string;
} {
  switch (recommendation) {
    case "apply_now":
      return { label: "Apply now", effortLabel: "Light tailoring" };
    case "tailor_and_apply":
      return { label: "Tailor and apply", effortLabel: "Custom tailoring" };
    case "keep_warm":
      return { label: "Keep warm", effortLabel: "Revisit later" };
    case "skip":
    default:
      return { label: "Skip", effortLabel: "No further effort" };
  }
}

function splitReason(reason: string | null | undefined): string[] {
  if (!reason) return [];
  return reason
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferWatchouts(job: Pick<Job, "salary" | "location" | "jobDescription">): string[] {
  const watchouts: string[] = [];
  const text = `${job.jobDescription ?? ""}`.toLowerCase();

  if (!job.salary || !job.salary.trim()) {
    watchouts.push("Compensation is unclear, so prioritization confidence is lower.");
  }
  if (text.includes("visa") || text.includes("sponsorship")) {
    watchouts.push("Check work authorization or sponsorship requirements before investing heavily.");
  }
  if (text.includes("hybrid") || text.includes("on-site") || text.includes("onsite")) {
    watchouts.push("Work arrangement may need a location or commute check.");
  }
  if (job.location && /(usa|united states|uk|london|new york|berlin|copenhagen)/i.test(job.location)) {
    watchouts.push(`Double-check location fit for ${job.location}.`);
  }

  return watchouts.slice(0, 3);
}

export function buildJobDecisionBrief(job: Pick<Job, "status" | "suitabilityScore" | "suitabilityReason" | "salary" | "location" | "jobDescription">): JobDecisionBrief {
  const recommendation = getJobRecommendation(job);
  const meta = getRecommendationMeta(recommendation);
  const reasonParts = splitReason(job.suitabilityReason);
  const watchouts = inferWatchouts(job);

  const rationale =
    reasonParts[0] ||
    (recommendation === "skip"
      ? "Current fit signal looks too weak to justify more time."
      : "This role is worth keeping in the pipeline based on current fit signals.");

  const whyApply = reasonParts.length > 0 ? reasonParts : [rationale];

  if (recommendation === "skip" && watchouts.length === 0) {
    watchouts.push("Low fit score suggests better opportunities are likely elsewhere.");
  }

  if (recommendation === "apply_now" && whyApply.length < 2) {
    whyApply.push("The current score is high enough that speed matters more than over-optimizing materials.");
  }

  if (recommendation === "tailor_and_apply" && watchouts.length === 0) {
    watchouts.push("Spend effort on sharper positioning before applying.");
  }

  if (recommendation === "keep_warm" && watchouts.length === 0) {
    watchouts.push("Good enough to revisit, but not obviously top-tier right now.");
  }

  return {
    recommendation,
    recommendationLabel: meta.label,
    effortLabel: meta.effortLabel,
    rationale,
    whyApply: whyApply.slice(0, 3),
    watchouts: watchouts.slice(0, 3),
  };
}

export function summarizeTriageBuckets(jobs: Array<Pick<JobListItem, "status" | "suitabilityScore">>) {
  const summary = {
    applyNow: 0,
    tailorAndApply: 0,
    keepWarm: 0,
    skip: 0,
  };

  for (const job of jobs) {
    if (!["discovered", "ready"].includes(job.status)) continue;
    const recommendation = getJobRecommendation(job);
    if (recommendation === "apply_now") summary.applyNow += 1;
    else if (recommendation === "tailor_and_apply") summary.tailorAndApply += 1;
    else if (recommendation === "keep_warm") summary.keepWarm += 1;
    else summary.skip += 1;
  }

  return summary;
}
