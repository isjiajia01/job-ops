import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { getExtractorRegistry } from "@server/extractors/registry";
import { getAllJobUrls } from "@server/repositories/jobs";
import * as settingsRepo from "@server/repositories/settings";
import { asyncPool } from "@server/utils/async-pool";
import {
  formatCountryLabel,
  isSourceAllowedForCountry,
  normalizeCountryKey,
} from "@shared/location-support.js";
import { normalizeStringArray } from "@shared/normalize-string-array.js";
import {
  matchesRequestedCity,
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { CreateJobInput, PipelineConfig } from "@shared/types";
import { type CrawlSource, progressHelpers, updateProgress } from "../progress";

const DISCOVERY_CONCURRENCY = 3;
const THEHUB_TERM_TELEMETRY_KEY = "thehubTermTelemetry";
const THEHUB_ZERO_HIT_PRUNE_THRESHOLD = 3;
const THEHUB_COOLDOWN_DAYS = 14;

const JOBSPY_DENMARK_PREFERRED_TERMS = new Set(
  [
    "demand planner",
    "supply planner",
    "supply chain planner",
    "inventory planner",
    "supply chain analyst",
    "logistics specialist",
    "operations planner",
    "disponent",
  ].map(normalizeSearchTerm),
);

const JOBINDEX_DENMARK_PREFERRED_TERMS = new Set(
  [
    "disponent",
    "logistikplanlægger",
    "demand planner",
    "supply planner",
    "inventory planner",
    "logistics specialist",
  ].map(normalizeSearchTerm),
);

const THEHUB_DENMARK_DEFAULT_TERMS = ["operations", "business analyst"];

type TheHubTermTelemetryEntry = {
  attempts: number;
  zeroHits: number;
  positiveRuns: number;
  jobsFound: number;
  consecutiveZeroHits: number;
  lastAttemptedAt: string;
  lastHitAt: string | null;
  lastZeroAt: string | null;
  cooldownUntil: string | null;
};

type TheHubTermTelemetry = Record<string, TheHubTermTelemetryEntry>;

type DiscoveryTaskResult = {
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
};

type DiscoverySourceTask = {
  source: CrawlSource;
  termsTotal?: number;
  detail: string;
  run: () => Promise<DiscoveryTaskResult>;
};

function normalizeSearchTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/\s+/g, " ");
}

function dedupeSearchTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const normalized = normalizeSearchTerm(term);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(term.trim());
  }
  return out;
}

function parseTheHubTermTelemetry(
  raw: string | undefined,
): TheHubTermTelemetry {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed).flatMap(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
      }
      const record = value as Record<string, unknown>;
      return [
        [
          normalizeSearchTerm(key),
          {
            attempts: typeof record.attempts === "number" ? record.attempts : 0,
            zeroHits: typeof record.zeroHits === "number" ? record.zeroHits : 0,
            positiveRuns:
              typeof record.positiveRuns === "number" ? record.positiveRuns : 0,
            jobsFound:
              typeof record.jobsFound === "number" ? record.jobsFound : 0,
            consecutiveZeroHits:
              typeof record.consecutiveZeroHits === "number"
                ? record.consecutiveZeroHits
                : 0,
            lastAttemptedAt:
              typeof record.lastAttemptedAt === "string"
                ? record.lastAttemptedAt
                : "",
            lastHitAt:
              typeof record.lastHitAt === "string" ? record.lastHitAt : null,
            lastZeroAt:
              typeof record.lastZeroAt === "string" ? record.lastZeroAt : null,
            cooldownUntil:
              typeof record.cooldownUntil === "string"
                ? record.cooldownUntil
                : null,
          } satisfies TheHubTermTelemetryEntry,
        ],
      ];
    });

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function shouldPruneTheHubTerm(
  term: string,
  telemetry: TheHubTermTelemetry,
  nowIso: string,
): boolean {
  const entry = telemetry[normalizeSearchTerm(term)];
  if (!entry) return false;
  if (
    entry.consecutiveZeroHits < THEHUB_ZERO_HIT_PRUNE_THRESHOLD ||
    !entry.cooldownUntil
  ) {
    return false;
  }
  return entry.cooldownUntil > nowIso;
}

function pruneTheHubTermsWithTelemetry(args: {
  searchTerms: string[];
  telemetryRaw: string | undefined;
}): string[] {
  const deduped = dedupeSearchTerms(args.searchTerms);
  const telemetry = parseTheHubTermTelemetry(args.telemetryRaw);
  const nowIso = new Date().toISOString();
  const filtered = deduped.filter(
    (term) => !shouldPruneTheHubTerm(term, telemetry, nowIso),
  );
  return filtered.length > 0 ? filtered : deduped.slice(0, 1);
}

async function updateTheHubTermTelemetry(args: {
  telemetryRaw: string | undefined;
  attemptedTerms: string[];
  termHitCounts: Record<string, number> | undefined;
}): Promise<void> {
  const telemetry = parseTheHubTermTelemetry(args.telemetryRaw);
  const now = new Date();
  const nowIso = now.toISOString();

  for (const term of dedupeSearchTerms(args.attemptedTerms)) {
    const key = normalizeSearchTerm(term);
    const hits = Math.max(0, args.termHitCounts?.[term] ?? 0);
    const previous = telemetry[key] ?? {
      attempts: 0,
      zeroHits: 0,
      positiveRuns: 0,
      jobsFound: 0,
      consecutiveZeroHits: 0,
      lastAttemptedAt: "",
      lastHitAt: null,
      lastZeroAt: null,
      cooldownUntil: null,
    };

    const next: TheHubTermTelemetryEntry = {
      ...previous,
      attempts: previous.attempts + 1,
      jobsFound: previous.jobsFound + hits,
      lastAttemptedAt: nowIso,
    };

    if (hits > 0) {
      next.positiveRuns = previous.positiveRuns + 1;
      next.consecutiveZeroHits = 0;
      next.lastHitAt = nowIso;
      next.cooldownUntil = null;
    } else {
      next.zeroHits = previous.zeroHits + 1;
      next.consecutiveZeroHits = previous.consecutiveZeroHits + 1;
      next.lastZeroAt = nowIso;
      if (next.consecutiveZeroHits >= THEHUB_ZERO_HIT_PRUNE_THRESHOLD) {
        const cooldownUntil = new Date(now);
        cooldownUntil.setDate(cooldownUntil.getDate() + THEHUB_COOLDOWN_DAYS);
        next.cooldownUntil = cooldownUntil.toISOString();
      }
    }

    telemetry[key] = next;
  }

  await settingsRepo.setSetting(
    THEHUB_TERM_TELEMETRY_KEY,
    JSON.stringify(telemetry),
  );
}

function pruneSearchTermsForManifest(args: {
  manifestId: string;
  selectedCountry: string;
  searchTerms: string[];
  settings: Partial<Record<settingsRepo.SettingKey, string>>;
}): string[] {
  const deduped = dedupeSearchTerms(args.searchTerms);
  if (deduped.length <= 1) return deduped;

  if (normalizeCountryKey(args.selectedCountry) !== "denmark") {
    return deduped;
  }

  if (args.manifestId === "thehub") {
    return pruneTheHubTermsWithTelemetry({
      searchTerms: THEHUB_DENMARK_DEFAULT_TERMS,
      telemetryRaw: args.settings[THEHUB_TERM_TELEMETRY_KEY],
    });
  }

  const preferredTerms =
    args.manifestId === "jobspy"
      ? JOBSPY_DENMARK_PREFERRED_TERMS
      : args.manifestId === "jobindex"
        ? JOBINDEX_DENMARK_PREFERRED_TERMS
        : null;

  if (!preferredTerms) return deduped;

  const filtered = deduped.filter((term) =>
    preferredTerms.has(normalizeSearchTerm(term)),
  );

  return filtered.length > 0 ? filtered : deduped;
}

function parseBlockedCompanyKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeStringArray(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return [];
  }
}

function isBlockedEmployer(
  employer: string | null | undefined,
  blockedKeywordsLowerCase: string[],
): boolean {
  if (!employer) return false;
  if (blockedKeywordsLowerCase.length === 0) return false;
  const normalizedEmployer = employer.toLowerCase();
  return blockedKeywordsLowerCase.some((keyword) =>
    normalizedEmployer.includes(keyword),
  );
}

function filterJobsByRequestedCities(args: {
  jobs: CreateJobInput[];
  selectedCountry: string;
  requestedCities: string[];
}): CreateJobInput[] {
  const { jobs, selectedCountry, requestedCities } = args;
  if (requestedCities.length === 0) return jobs;

  const strictRequestedCities = requestedCities.filter((requestedCity) =>
    shouldApplyStrictCityFilter(requestedCity, selectedCountry),
  );
  if (strictRequestedCities.length === 0) return jobs;

  return jobs.filter((job) =>
    strictRequestedCities.some((requestedCity) =>
      matchesRequestedCity(job.location, requestedCity),
    ),
  );
}

export async function discoverJobsStep(args: {
  mergedConfig: PipelineConfig;
  shouldCancel?: () => boolean;
}): Promise<{
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
}> {
  logger.info("Running discovery step");

  const discoveredJobs: CreateJobInput[] = [];
  const sourceErrors: string[] = [];

  const settings = await settingsRepo.getAllSettings();
  const registry = await getExtractorRegistry();

  const searchTermsSetting = settings.searchTerms;
  let searchTerms: string[] = [];

  if (searchTermsSetting) {
    searchTerms = JSON.parse(searchTermsSetting) as string[];
  } else {
    const defaultSearchTermsEnv =
      process.env.JOBSPY_SEARCH_TERMS || "web developer";
    searchTerms = defaultSearchTermsEnv
      .split("|")
      .map((term) => term.trim())
      .filter(Boolean);
  }

  const selectedCountry = normalizeCountryKey(
    settings.jobspyCountryIndeed ??
      settings.searchCities ??
      settings.jobspyLocation ??
      "united kingdom",
  );
  const compatibleSources = args.mergedConfig.sources.filter((source) =>
    isSourceAllowedForCountry(source, selectedCountry),
  );
  let existingJobUrlsPromise: Promise<string[]> | null = null;
  const getExistingJobUrls = (): Promise<string[]> => {
    if (!existingJobUrlsPromise) {
      existingJobUrlsPromise = getAllJobUrls();
    }
    return existingJobUrlsPromise;
  };
  const skippedSources = args.mergedConfig.sources.filter(
    (source) => !compatibleSources.includes(source),
  );

  if (skippedSources.length > 0) {
    logger.info("Skipping incompatible sources for selected country", {
      step: "discover-jobs",
      country: selectedCountry,
      countryLabel: formatCountryLabel(selectedCountry),
      requestedSources: args.mergedConfig.sources,
      skippedSources,
    });
  }

  if (args.mergedConfig.sources.length > 0 && compatibleSources.length === 0) {
    throw new Error(
      `No compatible sources for selected country: ${formatCountryLabel(selectedCountry)}`,
    );
  }

  const groupedByManifest = new Map<
    string,
    { sources: string[]; detail: string; termsTotal?: number }
  >();

  for (const source of compatibleSources) {
    const manifest = registry.manifestBySource.get(source);
    if (!manifest) {
      sourceErrors.push(`${source}: extractor manifest not registered`);
      continue;
    }

    const existing = groupedByManifest.get(manifest.id);
    if (existing) {
      existing.sources.push(source);
      continue;
    }

    groupedByManifest.set(manifest.id, {
      sources: [source],
      termsTotal: searchTerms.length,
      detail: `${manifest.displayName}: fetching jobs...`,
    });
  }

  const sourceTasks: DiscoverySourceTask[] = [];

  for (const [manifestId, grouped] of groupedByManifest) {
    const manifest = registry.manifests.get(manifestId);
    if (!manifest) continue;
    const manifestSearchTerms = pruneSearchTermsForManifest({
      manifestId,
      selectedCountry,
      searchTerms,
      settings,
    });

    sourceTasks.push({
      source: manifest.id,
      termsTotal: manifestSearchTerms.length,
      detail:
        grouped.sources.length > 1
          ? `${manifest.displayName}: ${grouped.sources.join(", ")}...`
          : grouped.detail,
      run: async () => {
        const filteredSettings = Object.fromEntries(
          Object.entries(settings).filter(
            ([, value]) =>
              typeof value === "string" || typeof value === "undefined",
          ),
        ) as Record<string, string | undefined>;

        const result = await manifest.run({
          source: grouped.sources[0],
          selectedSources: grouped.sources,
          settings: filteredSettings,
          searchTerms: manifestSearchTerms,
          selectedCountry,
          getExistingJobUrls,
          shouldCancel: args.shouldCancel,
          onProgress: (event) => {
            progressHelpers.crawlingUpdate({
              source: manifest.id,
              termsProcessed: event.termsProcessed,
              termsTotal: event.termsTotal,
              listPagesProcessed: event.listPagesProcessed,
              listPagesTotal: event.listPagesTotal,
              jobCardsFound: event.jobCardsFound,
              jobPagesEnqueued: event.jobPagesEnqueued,
              jobPagesSkipped: event.jobPagesSkipped,
              jobPagesProcessed: event.jobPagesProcessed,
              phase: event.phase,
              currentUrl: event.currentUrl,
            });

            if (event.detail) {
              updateProgress({
                step: "crawling",
                detail: event.detail,
              });
            }
          },
        });

        if (!result.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [
              `${manifest.displayName || manifest.id}: ${result.error ?? "unknown error"} (sources: ${grouped.sources.join(",")})`,
            ],
          };
        }

        if (manifest.id === "thehub") {
          await updateTheHubTermTelemetry({
            telemetryRaw: settings[THEHUB_TERM_TELEMETRY_KEY],
            attemptedTerms: manifestSearchTerms,
            termHitCounts: result.termHitCounts,
          });
        }

        return {
          discoveredJobs: result.jobs,
          sourceErrors: [],
        };
      },
    });
  }

  const totalSources = sourceTasks.length;
  let completedSources = 0;

  progressHelpers.startCrawling(totalSources);

  if (args.shouldCancel?.()) {
    return { discoveredJobs, sourceErrors };
  }

  const sourceResults = await asyncPool({
    items: sourceTasks,
    concurrency: DISCOVERY_CONCURRENCY,
    shouldStop: args.shouldCancel,
    onTaskStarted: (sourceTask) => {
      progressHelpers.startSource(
        sourceTask.source,
        completedSources,
        totalSources,
        {
          termsTotal: sourceTask.termsTotal,
          detail: sourceTask.detail,
        },
      );
    },
    onTaskSettled: () => {
      completedSources += 1;
      progressHelpers.completeSource(completedSources, totalSources);
    },
    task: async (sourceTask) => {
      try {
        return await sourceTask.run();
      } catch (error) {
        logger.warn("Discovery source task failed", {
          sourceTask: sourceTask.source,
          error: sanitizeUnknown(error),
        });

        return {
          discoveredJobs: [],
          sourceErrors: [
            `${sourceTask.source}: ${error instanceof Error ? error.message : "unknown error"}`,
          ],
        };
      }
    },
  });

  for (const sourceResult of sourceResults) {
    discoveredJobs.push(...sourceResult.discoveredJobs);
    sourceErrors.push(...sourceResult.sourceErrors);
  }

  const requestedCities = resolveSearchCities({
    single: settings.searchCities ?? settings.jobspyLocation,
  });
  const cityFilteredJobs = filterJobsByRequestedCities({
    jobs: discoveredJobs,
    selectedCountry,
    requestedCities,
  });
  const cityFilteredOutCount = discoveredJobs.length - cityFilteredJobs.length;

  if (cityFilteredOutCount > 0) {
    logger.info("Dropped discovered jobs that did not match requested cities", {
      step: "discover-jobs",
      droppedCount: cityFilteredOutCount,
      requestedCities,
      selectedCountry,
    });
  }

  const blockedCompanyKeywords = parseBlockedCompanyKeywords(
    settings.blockedCompanyKeywords,
  );
  const blockedKeywordsLowerCase = blockedCompanyKeywords.map((value) =>
    value.toLowerCase(),
  );
  const filteredDiscoveredJobs = cityFilteredJobs.filter(
    (job) => !isBlockedEmployer(job.employer, blockedKeywordsLowerCase),
  );
  const droppedCount = cityFilteredJobs.length - filteredDiscoveredJobs.length;

  if (droppedCount > 0) {
    const blockedCompanyKeywordsPreview = blockedCompanyKeywords.slice(0, 10);
    const blockedCompanyKeywordsTruncated =
      blockedCompanyKeywordsPreview.length < blockedCompanyKeywords.length;

    logger.info("Dropped discovered jobs matching blocked company keywords", {
      step: "discover-jobs",
      droppedCount,
      blockedKeywordCount: blockedCompanyKeywords.length,
      blockedCompanyKeywordsPreview,
      blockedCompanyKeywordsTruncated,
    });

    logger.debug("Full blocked company keywords used for filtering", {
      step: "discover-jobs",
      blockedCompanyKeywords,
    });
  }

  if (args.shouldCancel?.()) {
    return { discoveredJobs: filteredDiscoveredJobs, sourceErrors };
  }

  if (filteredDiscoveredJobs.length === 0 && sourceErrors.length > 0) {
    throw new Error(`All sources failed: ${sourceErrors.join("; ")}`);
  }

  if (sourceErrors.length > 0) {
    logger.warn("Some discovery sources failed", { sourceErrors });
  }

  progressHelpers.crawlingComplete(filteredDiscoveredJobs.length);

  return { discoveredJobs: filteredDiscoveredJobs, sourceErrors };
}
