import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as settingsRepo from "@server/repositories/settings";
import { suppressDuplicateDiscoveredJobs } from "@server/services/job-dedupe";
import { evaluateJobPrefilter } from "@server/services/job-prefilter";
import { scoreJobSuitability } from "@server/services/scorer";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { asyncPool } from "@server/utils/async-pool";
import type { Job } from "@shared/types";
import { progressHelpers, updateProgress } from "../progress";
import type { ScoredJob } from "./types";

const SCORING_CONCURRENCY = 4;

export async function scoreJobsStep(args: {
  profile: Record<string, unknown>;
  shouldCancel?: () => boolean;
}): Promise<{ unprocessedJobs: Job[]; scoredJobs: ScoredJob[] }> {
  logger.info("Running scoring step");
  const dedupeResult = await suppressDuplicateDiscoveredJobs();
  logger.info("Duplicate suppression completed", dedupeResult);
  const unprocessedJobs = await jobsRepo.getUnscoredDiscoveredJobs();

  const [autoSkipThresholdRaw, searchCitiesSetting, selectedCountry] =
    await Promise.all([
      settingsRepo.getSetting("autoSkipScoreThreshold"),
      settingsRepo.getSetting("searchCities"),
      settingsRepo.getSetting("jobspyCountryIndeed"),
    ]);

  const autoSkipThreshold = autoSkipThresholdRaw
    ? parseInt(autoSkipThresholdRaw, 10)
    : null;

  updateProgress({
    step: "scoring",
    jobsDiscovered: unprocessedJobs.length,
    jobsScored: 0,
    jobsProcessed: 0,
    totalToProcess: 0,
    currentJob: undefined,
  });

  const scoredJobs: ScoredJob[] = [];
  let completed = 0;

  await asyncPool({
    items: unprocessedJobs,
    concurrency: SCORING_CONCURRENCY,
    shouldStop: args.shouldCancel,
    task: async (job) => {
      if (args.shouldCancel?.()) return;

      const hasCachedScore =
        typeof job.suitabilityScore === "number" &&
        !Number.isNaN(job.suitabilityScore);

      if (hasCachedScore) {
        completed += 1;
        progressHelpers.scoringJob(
          completed,
          unprocessedJobs.length,
          `${job.title} (cached)`,
        );
        scoredJobs.push({
          ...job,
          suitabilityScore: job.suitabilityScore as number,
          suitabilityReason: job.suitabilityReason ?? "",
        });
        return;
      }

      const prefilter = evaluateJobPrefilter(job, {
        searchCitiesSetting,
        selectedCountry,
      });

      if (prefilter) {
        await jobsRepo.updateJob(job.id, {
          suitabilityScore: prefilter.score,
          suitabilityReason: prefilter.reason,
          status: prefilter.status,
        });

        logger.info("Auto-skipped job via hard prefilter", {
          jobId: job.id,
          title: job.title,
          category: prefilter.category,
          score: prefilter.score,
        });

        completed += 1;
        progressHelpers.scoringJob(
          completed,
          unprocessedJobs.length,
          `${job.title} (prefiltered)`,
        );
        scoredJobs.push({
          ...job,
          suitabilityScore: prefilter.score,
          suitabilityReason: prefilter.reason,
          status: prefilter.status,
        });
        return;
      }

      const { score, reason } = await scoreJobSuitability(job, args.profile);
      if (args.shouldCancel?.()) return;

      let sponsorMatchScore = 0;
      let sponsorMatchNames: string | undefined;

      if (job.employer) {
        const sponsorResults = await visaSponsors.searchSponsors(job.employer, {
          limit: 10,
          minScore: 50,
        });

        const summary =
          visaSponsors.calculateSponsorMatchSummary(sponsorResults);
        sponsorMatchScore = summary.sponsorMatchScore;
        sponsorMatchNames = summary.sponsorMatchNames ?? undefined;
      }

      const shouldAutoSkip =
        job.status !== "applied" &&
        autoSkipThreshold !== null &&
        !Number.isNaN(autoSkipThreshold) &&
        score < autoSkipThreshold;

      await jobsRepo.updateJob(job.id, {
        suitabilityScore: score,
        suitabilityReason: reason,
        sponsorMatchScore,
        sponsorMatchNames,
        ...(shouldAutoSkip ? { status: "skipped" } : {}),
      });

      if (shouldAutoSkip) {
        logger.info("Auto-skipped job due to low score", {
          jobId: job.id,
          title: job.title,
          score,
          threshold: autoSkipThreshold,
        });
      }

      completed += 1;
      progressHelpers.scoringJob(completed, unprocessedJobs.length, job.title);
      scoredJobs.push({
        ...job,
        suitabilityScore: score,
        suitabilityReason: reason,
      });
    },
  });

  progressHelpers.scoringComplete(scoredJobs.length);
  logger.info("Scoring step completed", {
    scoredJobs: scoredJobs.length,
    concurrency: SCORING_CONCURRENCY,
  });

  return { unprocessedJobs, scoredJobs };
}
