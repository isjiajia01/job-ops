import {
  matchesRequestedCity,
  parseSearchCitiesSetting,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { Job } from "@shared/types";

export interface JobPrefilterContext {
  searchCitiesSetting: string | null;
  selectedCountry: string | null;
}

export interface JobPrefilterDecision {
  score: number;
  reason: string;
  status: "skipped";
  category: "location" | "title" | "content";
}

type PatternGroup = {
  score: number;
  reason: string;
  patterns: RegExp[];
};

const NEGATIVE_TITLE_GROUPS: PatternGroup[] = [
  {
    score: 10,
    reason:
      "Title is communications, recruiting, or employer-brand work rather than planning-oriented supply chain work.",
    patterns: [/\b(kommunikat[oø]r|communication|communications|recruit(?:er|ing)|talent acquisition)\b/i],
  },
  {
    score: 5,
    reason:
      "Title is dominated by military, public case-handling, or non-commercial administration rather than planning-oriented supply chain work.",
    patterns: [/\b(milit[aæ]re?|military|sagsbehandler)\b/i],
  },
  {
    score: 8,
    reason:
      "Title is finance, controlling, commercial, or account-management oriented rather than planning-oriented supply chain work.",
    patterns: [
      /\b(controller|financial analyst|finance|accountant|audit|underwriter|key account|inside sales|field sales|sales|revenue operations|commercial agreements?|kommercielle? aftaler)\b/i,
    ],
  },
  {
    score: 8,
    reason:
      "Title is project, product, or general program management rather than the planning roles currently targeted.",
    patterns: [/\b(project manager|product manager|project lead|program manager)\b/i],
  },
  {
    score: 10,
    reason:
      "Title is assistant, student-support, or administrative support work rather than a full-time planning role.",
    patterns: [
      /\b(studentermedhj[aæ]lper|student assistant|administrative assistant|hr assistant|assistant)\b/i,
    ],
  },
  {
    score: 5,
    reason:
      "Title is execution-heavy transport, warehouse, or operator work rather than planning-oriented supply chain work.",
    patterns: [
      /\b(chauffør|driver|reach truck|warehouse|operatør|operator|forklift)\b/i,
    ],
  },
  {
    score: 10,
    reason:
      "Title is procurement, sourcing, or buyer-oriented rather than planning-oriented supply chain work.",
    patterns: [/\b(procurement|buyer|sourcing|purchasing|category manager)\b/i],
  },
  {
    score: 12,
    reason:
      "Title is primarily software, systems, or engineering oriented rather than planning-oriented supply chain work.",
    patterns: [
      /\b(python|software|developer|full[- ]?stack|frontend|backend|data engineer|ml engineer|systems specialist|tools & systems specialist|it[- ]?udvikler|technology coordinator)\b/i,
      /\b(subsea|r&d|end fitting|design review|design engineer|designer|engineer)\b/i,
    ],
  },
  {
    score: 18,
    reason:
      "Title signals a senior or management profile beyond the current junior-to-mid planning target.",
    patterns: [/\b(senior|manager|director|head|lead|principal|staff|vp|vice president|chief|afdelingsleder|driftsleder)\b/i],
  },
];

const STRONG_POSITIVE_TITLE_PATTERNS = [
  /\b(demand planner|supply planner|supply chain planner|inventory planner|production planner|material planner|replenishment planner|operations planner|logistics planner|transport planner|master planner|planning analyst)\b/i,
  /\b(forecast analyst|forecast planner|inventory analyst|supply chain analyst|logistics analyst)\b/i,
  /\b(planning specialist|supply chain specialist|logistics specialist)\b/i,
];

const STRONG_POSITIVE_CONTENT_PATTERNS = [
  /operations research/i,
  /optimization/i,
  /demand planning/i,
  /supply planning/i,
  /forecast(?:ing)?/i,
  /inventory (?:planning|control|management)/i,
  /replenishment/i,
  /production planning/i,
  /material planning/i,
  /planning analytics/i,
  /s&op/i,
  /mrp/i,
  /supply chain planning/i,
  /supply chain analytics/i,
  /logistics coordination/i,
  /distribution planning/i,
  /distribution/i,
  /freight/i,
  /shipping/i,
  /route planning/i,
  /routing/i,
  /spedition/i,
  /transport operations/i,
  /order management/i,
  /transport planning/i,
  /dispatch planning/i,
  /capacity planning/i,
  /network planning/i,
  /order fulfillment/i,
  /scheduler?/i,
];

const AMBIGUOUS_TITLE_PATTERNS = [
  /\b(analyst|coordinator|specialist|associate)\b/i,
  /\b(disponent|dispatcher)\b/i,
];

const NEGATIVE_CONTENT_GROUPS: PatternGroup[] = [
  {
    score: 10,
    reason:
      "Job content is dominated by finance, commercial, or consulting work rather than planning-oriented supply chain work.",
    patterns: [
      /financial planning/i,
      /fp&a/i,
      /audit/i,
      /management consulting/i,
      /sales pipeline/i,
      /account management/i,
      /commercial ownership/i,
      /commercial agreements/i,
      /recruitment/i,
      /revenue operations/i,
      /marketing/i,
    ],
  },
  {
    score: 10,
    reason:
      "Job content is dominated by procurement, sourcing, or category work rather than planning-oriented supply chain work.",
    patterns: [/procurement/i, /strategic sourcing/i, /purchasing/i, /category management/i],
  },
  {
    score: 12,
    reason:
      "Job content is primarily software-development oriented rather than planning-oriented supply chain work.",
    patterns: [
      /software applications?/i,
      /software development/i,
      /developer\b/i,
      /coding\b/i,
      /programming\b/i,
      /build(?:ing)? software/i,
      /develop new and current software/i,
    ],
  },
  {
    score: 10,
    reason:
      "Job content is dominated by clinical or regulated drug-supply operations rather than the planning roles currently targeted.",
    patterns: [/clinical/i, /drug supply/i, /gmp/i, /pharmacovigilance/i],
  },
];

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa");
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildJobText(job: Job): string {
  return [
    job.title,
    job.jobFunction,
    job.disciplines,
    job.degreeRequired,
    job.companyIndustry,
    job.jobDescription,
    job.skills,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n");
}

function hasStrongPositiveSignals(job: Job): boolean {
  const title = job.title ?? "";
  const text = buildJobText(job);
  return (
    matchesAny(title, STRONG_POSITIVE_TITLE_PATTERNS) ||
    matchesAny(text, STRONG_POSITIVE_CONTENT_PATTERNS)
  );
}

function evaluateTitleRule(job: Job): JobPrefilterDecision | null {
  const title = job.title ?? "";

  for (const group of NEGATIVE_TITLE_GROUPS) {
    if (matchesAny(title, group.patterns)) {
      return {
        score: group.score,
        status: "skipped",
        category: "title",
        reason: group.reason,
      };
    }
  }

  if (matchesAny(title, AMBIGUOUS_TITLE_PATTERNS) && !hasStrongPositiveSignals(job)) {
    return {
      score: 15,
      status: "skipped",
      category: "title",
      reason:
        "Title is too generic to justify a strong planning fit, and the job text lacks explicit planning, supply-chain, forecasting, inventory, logistics, or optimization signals.",
    };
  }

  return null;
}

function evaluateContentRule(job: Job): JobPrefilterDecision | null {
  const text = buildJobText(job);
  const hasPositiveSignals = hasStrongPositiveSignals(job);

  for (const group of NEGATIVE_CONTENT_GROUPS) {
    if (matchesAny(text, group.patterns) && !hasPositiveSignals) {
      return {
        score: group.score,
        status: "skipped",
        category: "content",
        reason: group.reason,
      };
    }
  }

  return null;
}

export function evaluateJobPrefilter(
  job: Job,
  context: JobPrefilterContext,
): JobPrefilterDecision | null {
  const strictCities = parseSearchCitiesSetting(context.searchCitiesSetting).filter(
    (city) => shouldApplyStrictCityFilter(city, context.selectedCountry ?? ""),
  );

  if (strictCities.length > 0 && job.location?.trim()) {
    const normalizedLocation = normalizeToken(job.location);
    const inScope = strictCities.some((city) =>
      matchesRequestedCity(normalizedLocation, normalizeToken(city)),
    );

    if (!inScope) {
      return {
        score: 5,
        status: "skipped",
        category: "location",
        reason:
          "Location is outside the currently configured Copenhagen-first search area.",
      };
    }
  }

  const titleDecision = evaluateTitleRule(job);
  if (titleDecision) return titleDecision;

  return evaluateContentRule(job);
}
