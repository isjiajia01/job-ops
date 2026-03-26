import type { PipelineConfig } from "@shared/types";
import type { ScoredJob } from "./types";

const DIVERSITY_SCORE_WINDOW = 10;

const SOURCE_PRIORITY: Record<string, number> = {
  jobindex: 5,
  indeed: 4,
  linkedin: 3,
  glassdoor: 2,
  adzuna: 2,
  hiringcafe: 1,
  gradcracker: 1,
  ukvisajobs: 1,
  startupjobs: 1,
  manual: 0,
};

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferRoleFamily(job: ScoredJob): string {
  const title = normalizeTitle(job.title);
  if (!title) return "unknown";

  if (/\b(disponent|dispatcher|dispatch)\b/.test(title)) {
    return "dispatch-logistics";
  }
  if (/\bdemand\b/.test(title)) return "demand";
  if (/\bsupply chain\b/.test(title)) return "supply-chain";
  if (/\binventory\b|\breplenishment\b/.test(title)) return "inventory";
  if (/\bsupply\b/.test(title)) return "supply";
  if (/\blogistics\b|\btransport\b|\bfreight\b|\broute\b/.test(title)) {
    return "logistics";
  }
  if (/\bproduction\b|\bmaterial\b/.test(title)) return "production-material";
  if (/\bforecast/.test(title)) return "forecast";
  if (/\bplanner\b|\bplanning\b/.test(title)) return "planning";

  const fallbackTokens = title
    .split(" ")
    .filter(
      (token) =>
        token &&
        ![
          "senior",
          "junior",
          "lead",
          "principal",
          "associate",
          "specialist",
          "analyst",
          "coordinator",
          "manager",
        ].includes(token),
    )
    .slice(0, 2);

  return fallbackTokens.join("-") || title;
}

function compareSelectedJobs(left: ScoredJob, right: ScoredJob): number {
  const scoreDiff =
    (right.suitabilityScore ?? 0) - (left.suitabilityScore ?? 0);
  if (scoreDiff !== 0) return scoreDiff;

  const sponsorDiff =
    (right.sponsorMatchScore ?? 0) - (left.sponsorMatchScore ?? 0);
  if (sponsorDiff !== 0) return sponsorDiff;

  const sourceDiff =
    (SOURCE_PRIORITY[right.source] ?? 0) - (SOURCE_PRIORITY[left.source] ?? 0);
  if (sourceDiff !== 0) return sourceDiff;

  const postedDiff =
    parseTimestamp(right.datePosted) - parseTimestamp(left.datePosted);
  if (postedDiff !== 0) return postedDiff;

  const discoveredDiff =
    parseTimestamp(right.discoveredAt) - parseTimestamp(left.discoveredAt);
  if (discoveredDiff !== 0) return discoveredDiff;

  return left.id.localeCompare(right.id);
}

function diversifyCompetitiveJobs(
  rankedJobs: ScoredJob[],
  topN: number,
): ScoredJob[] {
  if (topN <= 1 || rankedJobs.length <= 1) {
    return rankedJobs.slice(0, topN);
  }

  const topScore = rankedJobs[0]?.suitabilityScore ?? 0;
  const competitiveJobs = rankedJobs.filter(
    (job) => (job.suitabilityScore ?? 0) >= topScore - DIVERSITY_SCORE_WINDOW,
  );

  const selected: ScoredJob[] = [];
  const selectedIds = new Set<string>();
  const seenFamilies = new Set<string>();

  for (const job of competitiveJobs) {
    const family = inferRoleFamily(job);
    if (seenFamilies.has(family)) continue;
    selected.push(job);
    selectedIds.add(job.id);
    seenFamilies.add(family);
    if (selected.length >= topN) return selected;
  }

  for (const job of rankedJobs) {
    if (selectedIds.has(job.id)) continue;
    selected.push(job);
    selectedIds.add(job.id);
    if (selected.length >= topN) break;
  }

  return selected;
}

export function selectJobsStep(args: {
  scoredJobs: ScoredJob[];
  mergedConfig: PipelineConfig;
}): ScoredJob[] {
  const rankedJobs = args.scoredJobs
    .filter(
      (job) =>
        (job.suitabilityScore ?? 0) >= args.mergedConfig.minSuitabilityScore,
    )
    .sort(compareSelectedJobs);

  return diversifyCompetitiveJobs(rankedJobs, args.mergedConfig.topN);
}
