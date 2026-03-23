import {
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runJobindex } from "./src/run";

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  pageNo?: number;
  totalCollected?: number;
}): ExtractorProgressEvent {
  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `Jobindex: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  if (event.type === "page_fetched") {
    const pageNo = event.pageNo ?? 0;
    const totalCollected = event.totalCollected ?? 0;
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: pageNo,
      jobPagesEnqueued: totalCollected,
      jobPagesProcessed: totalCollected,
      currentUrl: `page ${pageNo}`,
      detail: `Jobindex: term ${event.termIndex}/${event.termTotal}, page ${pageNo} (${totalCollected} collected)`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    detail: `Jobindex: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
  };
}

export const manifest: ExtractorManifest = {
  id: "jobindex",
  displayName: "Jobindex",
  providesSources: ["jobindex"],
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const strictLocationRequested = resolveSearchCities({
      single: context.settings.searchCities ?? context.settings.jobspyLocation,
    }).some((location) =>
      shouldApplyStrictCityFilter(location, context.selectedCountry),
    );

    const parsedMaxJobsPerTerm = context.settings.jobspyResultsWanted
      ? Number.parseInt(context.settings.jobspyResultsWanted, 10)
      : Number.NaN;
    const maxJobsPerTerm = Number.isFinite(parsedMaxJobsPerTerm)
      ? Math.max(1, parsedMaxJobsPerTerm)
      : 25;

    const result = await runJobindex({
      selectedCountry: context.selectedCountry,
      searchTerms: context.searchTerms,
      locations: resolveSearchCities({
        single: context.settings.searchCities ?? context.settings.jobspyLocation,
      }),
      maxJobsPerTerm,
      preferredPagesPerTerm: strictLocationRequested ? 4 : 2,
      shouldCancel: context.shouldCancel,
      onProgress: (event) => {
        if (context.shouldCancel?.()) return;
        context.onProgress?.(toProgress(event));
      },
    });

    if (!result.success) {
      return {
        success: false,
        jobs: [],
        error: result.error,
      };
    }

    return {
      success: true,
      jobs: result.jobs,
    };
  },
};

export default manifest;
