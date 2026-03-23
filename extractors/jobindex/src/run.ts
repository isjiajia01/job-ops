import {
  matchesRequestedCity,
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import { normalizeCountryKey } from "@shared/location-support.js";
import type { CreateJobInput } from "@shared/types/jobs";

const BASE_URL = "https://www.jobindex.dk";
const PAGE_SIZE = 20;
const HARD_MAX_PAGES = 5;

type JobindexRawResult = {
  headline?: string;
  companytext?: string;
  area?: string;
  firstdate?: string;
  apply_deadline?: string;
  share_url?: string;
  url?: string;
  tid?: string;
  html?: string;
  home_workplace?: boolean;
  company?: {
    name?: string;
    homeurl?: string;
  };
  addresses?: Array<{
    simple_string?: string;
  }>;
  app_apply_url?: string | null;
  apply_url?: string | null;
  is_archived?: boolean;
};

export type JobindexProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_fetched";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      pageNo: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunJobindexOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  maxJobsPerTerm?: number;
  preferredPagesPerTerm?: number;
  shouldCancel?: () => boolean;
  onProgress?: (event: JobindexProgressEvent) => void;
}

export interface JobindexResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/");
}

function stripHtml(value: string): string {
  return normalizeText(
    decodeHtmlEntities(
      value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function toAbsoluteUrl(value: string | null | undefined): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) return undefined;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/")) {
    return new URL(normalized, BASE_URL).toString();
  }
  return normalized;
}

function extractResultsArray(page: string): JobindexRawResult[] {
  const token = '"results":[';
  const start = page.indexOf(token);
  if (start < 0) return [];

  const arrayStart = start + token.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart; index < page.length; index += 1) {
    const char = page[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(page.slice(arrayStart, index + 1)) as JobindexRawResult[];
        } catch {
          return [];
        }
      }
    }
  }

  return [];
}

function extractApplicationLink(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<h4><A HREF="([^"]+)"/i);
  return toAbsoluteUrl(match?.[1]);
}

function extractDescriptionSnippet(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const paragraphs = Array.from(html.matchAll(/<p>(.*?)<\/p>/gi))
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.slice(0, 2).join(" ");
  }

  const listItems = Array.from(html.matchAll(/<li>(.*?)<\/li>/gi))
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);

  return listItems.length > 0 ? listItems.slice(0, 3).join(" ") : undefined;
}

function mapJobindexResult(result: JobindexRawResult): CreateJobInput | null {
  if (result.is_archived) return null;

  const title = normalizeText(result.headline);
  const employer = normalizeText(result.companytext || result.company?.name);
  const jobUrl = toAbsoluteUrl(result.share_url || result.url);
  const location = normalizeText(
    result.area || result.addresses?.[0]?.simple_string,
  );

  if (!title || !employer || !jobUrl) return null;

  return {
    source: "jobindex",
    sourceJobId: normalizeText(result.tid) || undefined,
    title,
    employer,
    employerUrl: toAbsoluteUrl(result.company?.homeurl),
    jobUrl,
    applicationLink:
      toAbsoluteUrl(result.app_apply_url ?? result.apply_url)
      || extractApplicationLink(result.html)
      || jobUrl,
    location: location || undefined,
    deadline: normalizeText(result.apply_deadline) || undefined,
    datePosted: normalizeText(result.firstdate) || undefined,
    jobDescription: extractDescriptionSnippet(result.html),
    isRemote: result.home_workplace ? true : undefined,
    jobUrlDirect: toAbsoluteUrl(result.url),
  };
}

async function fetchSearchPage(args: {
  searchTerm: string;
  pageNo: number;
}): Promise<JobindexRawResult[]> {
  const url = new URL("/jobsoegning", BASE_URL);
  url.searchParams.set("q", args.searchTerm);
  if (args.pageNo > 1) {
    url.searchParams.set("page", String(args.pageNo));
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Jobindex request failed with HTTP ${response.status}`);
  }

  return extractResultsArray(await response.text());
}

function filterJobsByRequestedCities(args: {
  jobs: CreateJobInput[];
  strictCities: string[];
}): CreateJobInput[] {
  if (args.strictCities.length === 0) return args.jobs;

  return args.jobs.filter((job) =>
    args.strictCities.some((city) => matchesRequestedCity(job.location, city)),
  );
}

export async function runJobindex(
  options: RunJobindexOptions = {},
): Promise<JobindexResult> {
  const selectedCountry = normalizeCountryKey(options.selectedCountry ?? "");
  if (selectedCountry && selectedCountry !== "denmark") {
    return {
      success: false,
      jobs: [],
      error: `Jobindex only supports Denmark, got ${selectedCountry}`,
    };
  }

  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["demand planner"];
  const requestedCities = resolveSearchCities({ list: options.locations });
  const strictCities = requestedCities.filter((city) =>
    shouldApplyStrictCityFilter(city, "denmark"),
  );
  const maxJobsPerTerm = Math.max(1, options.maxJobsPerTerm ?? 25);
  const pagesPerTerm = Math.min(
    HARD_MAX_PAGES,
    Math.max(
      Math.ceil(maxJobsPerTerm / PAGE_SIZE),
      options.preferredPagesPerTerm ?? 1,
    ),
  );
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();
  const termTotal = searchTerms.length;

  try {
    for (let termIndex = 0; termIndex < searchTerms.length; termIndex += 1) {
      const searchTerm = searchTerms[termIndex];
      options.onProgress?.({
        type: "term_start",
        termIndex: termIndex + 1,
        termTotal,
        searchTerm,
      });

      let jobsFoundTerm = 0;
      let collectedThisTerm = 0;

      for (let pageNo = 1; pageNo <= pagesPerTerm; pageNo += 1) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }

        const rawResults = await fetchSearchPage({ searchTerm, pageNo });
        if (rawResults.length === 0) break;

        const mapped = filterJobsByRequestedCities({
          jobs: rawResults
            .map(mapJobindexResult)
            .filter((value): value is CreateJobInput => value !== null),
          strictCities,
        });

        for (const job of mapped) {
          const dedupeKey = job.sourceJobId || job.jobUrl;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          jobs.push(job);
          jobsFoundTerm += 1;
          collectedThisTerm += 1;
        }

        options.onProgress?.({
          type: "page_fetched",
          termIndex: termIndex + 1,
          termTotal,
          searchTerm,
          pageNo,
          totalCollected: collectedThisTerm,
        });

        if (rawResults.length < PAGE_SIZE) break;
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex: termIndex + 1,
        termTotal,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return {
      success: true,
      jobs,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running Jobindex extractor.";
    return {
      success: false,
      jobs: [],
      error: message,
    };
  }
}
