import { Script, createContext } from "node:vm";
import {
  matchesRequestedCity,
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import { normalizeCountryKey } from "@shared/location-support.js";
import type { CreateJobInput } from "@shared/types/jobs";

const BASE_URL = "https://thehub.io";
const COUNTRY_CODE_BY_KEY: Record<string, string> = {
  denmark: "DK",
};
const HARD_MAX_PAGES = 30;

type TheHubCompany = {
  id?: string;
  key?: string;
  name?: string;
  website?: string;
  whatWeDo?: string;
  logoImage?: {
    path?: string;
  };
};

type TheHubLocation = {
  address?: string;
  locality?: string;
  country?: string;
};

type TheHubJobCard = {
  id?: string;
  key?: string;
  title?: string;
  isRemote?: boolean;
  location?: TheHubLocation;
  jobPositionTypes?: string[];
  company?: TheHubCompany;
};

type TheHubJobDetails = TheHubJobCard & {
  description?: string;
  salary?: string;
  publishedAt?: string;
  expirationDate?: string;
};

type TheHubJobsPage = {
  total?: number;
  limit?: number;
  page?: number;
  pages?: number;
  docs?: TheHubJobCard[];
};

type TheHubProgressEvent =
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

export interface RunTheHubOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  preferredPages?: number;
  shouldCancel?: () => boolean;
  onProgress?: (event: TheHubProgressEvent) => void;
}

export interface TheHubResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeSearchTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesSearchTerm(text: string, searchTerm: string): boolean {
  const normalizedText = normalizeSearchTerm(text);
  const normalizedTerm = normalizeSearchTerm(searchTerm);
  if (!normalizedText || !normalizedTerm) return false;
  const tokens = normalizedTerm.split(" ").filter(Boolean);
  return tokens.every((token) => normalizedText.includes(token));
}

function toAbsoluteUrl(path: string | null | undefined): string | undefined {
  const normalized = normalizeText(path);
  if (!normalized) return undefined;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/")) {
    return new URL(normalized, BASE_URL).toString();
  }
  return normalized;
}

function extractNuxtState(html: string): unknown {
  const match = html.match(/<script>window\.__NUXT__=(.*?)<\/script>/s);
  if (!match?.[1]) {
    throw new Error("The Hub page did not contain embedded Nuxt state.");
  }

  const sandbox = { window: {} as { __NUXT__?: unknown } };
  const context = createContext(sandbox);
  const script = new Script(`window.__NUXT__=${match[1]}`);
  script.runInContext(context, { timeout: 5000 });
  return sandbox.window.__NUXT__;
}

function getJobsPageFromNuxtState(state: unknown): TheHubJobsPage {
  const record = state as {
    state?: { jobs?: { jobs?: TheHubJobsPage } };
  };
  return record?.state?.jobs?.jobs ?? {};
}

function getJobFromNuxtState(state: unknown): TheHubJobDetails | null {
  const record = state as {
    state?: { jobs?: { job?: TheHubJobDetails } };
  };
  return record?.state?.jobs?.job ?? null;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`The Hub request failed with HTTP ${response.status}`);
  }

  return response.text();
}

function mapPositionTypes(ids: string[] | undefined): string | undefined {
  if (!ids?.length) return undefined;
  const labelById: Record<string, string> = {
    "5b8e46b3853f039706b6ea70": "Full-time",
    "5b8e46b3853f039706b6ea71": "Part-time",
    "5b8e46b3853f039706b6ea72": "Student",
    "5b8e46b3853f039706b6ea73": "Internship",
    "5b8e46b3853f039706b6ea74": "Cofounder",
    "5b8e46b3853f039706b6ea75": "Freelance",
    "62e28180d8cca695ee60c98e": "Advisory board",
  };
  const labels = ids.map((id) => labelById[id]).filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : undefined;
}

function matchesRequestedLocations(args: {
  details: TheHubJobDetails;
  requestedLocations: string[];
  selectedCountry: string;
}): boolean {
  const strictRequestedLocations = args.requestedLocations.filter((location) =>
    shouldApplyStrictCityFilter(location, args.selectedCountry),
  );
  if (strictRequestedLocations.length === 0) return true;

  const locationText = normalizeText(
    args.details.location?.address ||
      [args.details.location?.locality, args.details.location?.country]
        .filter(Boolean)
        .join(", "),
  );

  return strictRequestedLocations.some((location) =>
    matchesRequestedCity(locationText, location),
  );
}

function mapTheHubJob(details: TheHubJobDetails): CreateJobInput | null {
  const id = normalizeText(details.id);
  const title = normalizeText(details.title);
  const employer = normalizeText(details.company?.name);
  if (!id || !title || !employer) return null;

  const jobPath = `/jobs/${id}`;
  const jobUrl = new URL(jobPath, BASE_URL).toString();
  const companyUrl =
    details.company?.key
      ? new URL(`/startups/${details.company.key}`, BASE_URL).toString()
      : undefined;
  const location =
    normalizeText(details.location?.address) ||
    normalizeText(
      [details.location?.locality, details.location?.country]
        .filter(Boolean)
        .join(", "),
    ) ||
    undefined;

  return {
    source: "thehub",
    sourceJobId: id,
    title,
    employer,
    employerUrl: companyUrl,
    jobUrl,
    applicationLink: jobUrl,
    location,
    deadline: normalizeText(details.expirationDate) || undefined,
    datePosted: normalizeText(details.publishedAt) || undefined,
    jobDescription: normalizeText(details.description) || undefined,
    salary: normalizeText(details.salary) || undefined,
    jobType: mapPositionTypes(details.jobPositionTypes),
    isRemote: details.isRemote ?? undefined,
    companyUrlDirect: normalizeText(details.company?.website) || undefined,
    companyDescription: normalizeText(details.company?.whatWeDo) || undefined,
    companyLogo: details.company?.logoImage?.path
      ? `https://thehub-io.imgix.net${details.company.logoImage.path}`
      : undefined,
  };
}

export async function runTheHub(
  options: RunTheHubOptions = {},
): Promise<TheHubResult> {
  const selectedCountry = normalizeCountryKey(options.selectedCountry ?? "");
  if (selectedCountry && selectedCountry !== "denmark") {
    return {
      success: false,
      jobs: [],
      error: `The Hub extractor currently supports Denmark only, got ${selectedCountry}`,
    };
  }

  const searchTerms =
    options.searchTerms?.filter((term) => normalizeText(term).length > 0) ?? [];
  const requestedLocations = resolveSearchCities({
    list: options.locations,
  });
  const preferredPages = Math.max(1, options.preferredPages ?? 8);

  try {
    const countryCode = COUNTRY_CODE_BY_KEY[selectedCountry || "denmark"] || "DK";
    const firstHtml = await fetchHtml(
      `${BASE_URL}/jobs?countryCode=${countryCode}&page=1`,
    );
    const firstState = extractNuxtState(firstHtml);
    const firstPage = getJobsPageFromNuxtState(firstState);
    const totalPages = Math.min(firstPage.pages ?? 1, HARD_MAX_PAGES);
    const maxPages = Math.min(totalPages, Math.max(preferredPages, 1));

    const allCards: TheHubJobCard[] = [];
    if (Array.isArray(firstPage.docs)) {
      allCards.push(...firstPage.docs);
    }

    for (let pageNo = 2; pageNo <= maxPages; pageNo += 1) {
      if (options.shouldCancel?.()) {
        return { success: true, jobs: [] };
      }
      const html = await fetchHtml(
        `${BASE_URL}/jobs?countryCode=${countryCode}&page=${pageNo}`,
      );
      const state = extractNuxtState(html);
      const page = getJobsPageFromNuxtState(state);
      if (Array.isArray(page.docs)) {
        allCards.push(...page.docs);
      }
    }

    const uniqueCards = new Map<string, TheHubJobCard>();
    for (const card of allCards) {
      const id = normalizeText(card.id);
      if (!id || uniqueCards.has(id)) continue;
      uniqueCards.set(id, card);
    }

    const jobs: CreateJobInput[] = [];
    const cards = Array.from(uniqueCards.values());
    const termTotal = searchTerms.length || 1;

    for (let termIndex = 0; termIndex < termTotal; termIndex += 1) {
      const searchTerm = searchTerms[termIndex] ?? "";
      options.onProgress?.({
        type: "term_start",
        termIndex: termIndex + 1,
        termTotal,
        searchTerm: searchTerm || "all jobs",
      });

      let jobsFoundTerm = 0;
      const candidateCards =
        searchTerm.length === 0
          ? cards
          : cards.filter((card) =>
              matchesSearchTerm(
                [card.title, card.company?.name, card.location?.locality]
                  .filter(Boolean)
                  .join(" "),
                searchTerm,
              ),
            );

      for (let index = 0; index < candidateCards.length; index += 1) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }

        const card = candidateCards[index];
        const id = normalizeText(card.id);
        if (!id) continue;

        const detailHtml = await fetchHtml(`${BASE_URL}/jobs/${id}`);
        const detailState = extractNuxtState(detailHtml);
        const details = getJobFromNuxtState(detailState);
        if (!details) continue;

        if (
          searchTerm &&
          !matchesSearchTerm(
            [details.title, details.description, details.company?.name]
              .filter(Boolean)
              .join(" "),
            searchTerm,
          )
        ) {
          continue;
        }

        if (
          !matchesRequestedLocations({
            details,
            requestedLocations,
            selectedCountry,
          })
        ) {
          continue;
        }

        const mapped = mapTheHubJob(details);
        if (!mapped) continue;
        jobs.push(mapped);
        jobsFoundTerm += 1;

        options.onProgress?.({
          type: "page_fetched",
          termIndex: termIndex + 1,
          termTotal,
          searchTerm: searchTerm || "all jobs",
          pageNo: index + 1,
          totalCollected: jobsFoundTerm,
        });
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex: termIndex + 1,
        termTotal,
        searchTerm: searchTerm || "all jobs",
        jobsFoundTerm,
      });
    }

    return { success: true, jobs };
  } catch (error) {
    return {
      success: false,
      jobs: [],
      error: error instanceof Error ? error.message : "The Hub extractor failed.",
    };
  }
}
