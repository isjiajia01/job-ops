import type { PipelineConfig } from "@shared/types";
import { describe, expect, it } from "vitest";
import { selectJobsStep } from "./select-jobs";

const baseConfig: PipelineConfig = {
  topN: 2,
  minSuitabilityScore: 50,
  sources: ["gradcracker"],
  outputDir: "./tmp",
  enableCrawling: true,
  enableScoring: true,
  enableImporting: true,
  enableAutoTailoring: true,
};

describe("selectJobsStep", () => {
  it("filters by min score, sorts descending, and limits topN", () => {
    const jobs = [
      { id: "a", suitabilityScore: 90, suitabilityReason: "high" },
      { id: "b", suitabilityScore: 45, suitabilityReason: "low" },
      { id: "c", suitabilityScore: 80, suitabilityReason: "med" },
      { id: "d", suitabilityScore: 70, suitabilityReason: "ok" },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: baseConfig,
    });

    expect(selected.map((job) => job.id)).toEqual(["a", "c"]);
  });

  it("breaks score ties using sponsor match score first", () => {
    const jobs = [
      {
        id: "a",
        source: "linkedin",
        suitabilityScore: 80,
        sponsorMatchScore: 40,
        discoveredAt: "2026-03-20T10:00:00.000Z",
      },
      {
        id: "b",
        source: "linkedin",
        suitabilityScore: 80,
        sponsorMatchScore: 75,
        discoveredAt: "2026-03-20T09:00:00.000Z",
      },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: { ...baseConfig, topN: 2 },
    });

    expect(selected.map((job) => job.id)).toEqual(["b", "a"]);
  });

  it("prefers stronger sources when score and sponsor match are tied", () => {
    const jobs = [
      {
        id: "linkedin-job",
        source: "linkedin",
        suitabilityScore: 80,
        sponsorMatchScore: 0,
        discoveredAt: "2026-03-20T10:00:00.000Z",
      },
      {
        id: "jobindex-job",
        source: "jobindex",
        suitabilityScore: 80,
        sponsorMatchScore: 0,
        discoveredAt: "2026-03-20T09:00:00.000Z",
      },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: { ...baseConfig, topN: 2 },
    });

    expect(selected.map((job) => job.id)).toEqual([
      "jobindex-job",
      "linkedin-job",
    ]);
  });

  it("prefers fresher jobs when score, sponsor match, and source are tied", () => {
    const jobs = [
      {
        id: "older",
        source: "linkedin",
        suitabilityScore: 80,
        sponsorMatchScore: 0,
        datePosted: "2026-03-18T00:00:00.000Z",
        discoveredAt: "2026-03-20T09:00:00.000Z",
      },
      {
        id: "newer",
        source: "linkedin",
        suitabilityScore: 80,
        sponsorMatchScore: 0,
        datePosted: "2026-03-22T00:00:00.000Z",
        discoveredAt: "2026-03-20T08:00:00.000Z",
      },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: { ...baseConfig, topN: 2 },
    });

    expect(selected.map((job) => job.id)).toEqual(["newer", "older"]);
  });

  it("adds light role diversity inside the competitive score band", () => {
    const jobs = [
      {
        id: "demand-a",
        title: "Demand Planner",
        source: "jobindex",
        suitabilityScore: 95,
        sponsorMatchScore: 20,
        discoveredAt: "2026-03-22T10:00:00.000Z",
      },
      {
        id: "demand-b",
        title: "Demand Planning Specialist",
        source: "indeed",
        suitabilityScore: 94,
        sponsorMatchScore: 10,
        discoveredAt: "2026-03-22T09:00:00.000Z",
      },
      {
        id: "logistics-a",
        title: "Logistics Specialist",
        source: "linkedin",
        suitabilityScore: 92,
        sponsorMatchScore: 15,
        discoveredAt: "2026-03-22T08:00:00.000Z",
      },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: { ...baseConfig, topN: 2 },
    });

    expect(selected.map((job) => job.id)).toEqual(["demand-a", "logistics-a"]);
  });

  it("does not force diversity when the alternative is far below the top score", () => {
    const jobs = [
      {
        id: "demand-a",
        title: "Demand Planner",
        source: "jobindex",
        suitabilityScore: 95,
        sponsorMatchScore: 20,
        discoveredAt: "2026-03-22T10:00:00.000Z",
      },
      {
        id: "demand-b",
        title: "Demand Planning Specialist",
        source: "indeed",
        suitabilityScore: 92,
        sponsorMatchScore: 10,
        discoveredAt: "2026-03-22T09:00:00.000Z",
      },
      {
        id: "logistics-a",
        title: "Logistics Specialist",
        source: "linkedin",
        suitabilityScore: 80,
        sponsorMatchScore: 30,
        discoveredAt: "2026-03-22T08:00:00.000Z",
      },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: { ...baseConfig, topN: 2 },
    });

    expect(selected.map((job) => job.id)).toEqual(["demand-a", "demand-b"]);
  });
});
