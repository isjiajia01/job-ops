import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { evaluateJobPrefilter } from "./job-prefilter";

const baseContext = {
  searchCitiesSetting: "Copenhagen|Brøndby|Ballerup|Køge",
  selectedCountry: "denmark",
} as const;

describe("job prefilter", () => {
  it("keeps strong planning titles", () => {
    const job = createJob({
      title: "Supply Chain Planner",
      location: "Copenhagen",
      jobDescription:
        "Demand planning, inventory planning, replenishment, and forecasting for Nordic operations.",
    });

    expect(evaluateJobPrefilter(job, baseContext)).toBeNull();
  });

  it("skips senior product and management titles", () => {
    const job = createJob({
      title: "Senior Product Manager",
      location: "Copenhagen",
    });

    expect(evaluateJobPrefilter(job, baseContext)).toMatchObject({
      status: "skipped",
      category: "title",
    });
  });

  it("skips ambiguous analyst roles without planning evidence", () => {
    const job = createJob({
      title: "Operations Analyst",
      location: "Copenhagen",
      jobDescription:
        "Support commercial reporting, dashboard maintenance, and finance stakeholder requests.",
    });

    expect(evaluateJobPrefilter(job, baseContext)).toMatchObject({
      status: "skipped",
      category: "title",
    });
  });

  it("keeps ambiguous analyst roles when planning evidence is present", () => {
    const job = createJob({
      title: "Operations Analyst",
      location: "Copenhagen",
      jobDescription:
        "Work on forecasting, inventory control, replenishment, and planning analytics for supply chain decisions.",
    });

    expect(evaluateJobPrefilter(job, baseContext)).toBeNull();
  });

  it("keeps disponent roles when logistics planning evidence is present", () => {
    const job = createJob({
      title: "Disponent",
      location: "Brøndby",
      jobDescription:
        "Coordinate dispatch planning, transport planning, and logistics coordination across daily routes.",
    });

    expect(evaluateJobPrefilter(job, baseContext)).toBeNull();
  });

  it("skips jobs outside the configured city scope", () => {
    const job = createJob({
      title: "Supply Planner",
      location: "Aarhus",
      jobDescription: "Inventory planning and forecasting role.",
    });

    expect(evaluateJobPrefilter(job, baseContext)).toMatchObject({
      status: "skipped",
      category: "location",
    });
  });
});
