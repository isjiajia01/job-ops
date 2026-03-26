import { createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import { getJobListingUrl, safeFilenamePart } from "./utils";

describe("safeFilenamePart", () => {
  it("replaces non-alphanumeric characters with underscores", () => {
    expect(safeFilenamePart("Acme, Inc.")).toBe("Acme__Inc_");
  });

  it("falls back to Unknown when empty after cleaning", () => {
    expect(safeFilenamePart("")).toBe("Unknown");
    expect(safeFilenamePart("!!!")).toBe("Unknown");
  });
});

describe("getJobListingUrl", () => {
  it("prefers the listing url for jobindex jobs", () => {
    const job = createJob({
      source: "jobindex",
      jobUrl: "https://www.jobindex.dk/jobannonce/share/123",
      jobUrlDirect: "https://www.jobindex.dk/jobannonce/123",
      applicationLink: "https://www.jobindex.dk/api/apply/123",
    });

    expect(getJobListingUrl(job)).toBe(
      "https://www.jobindex.dk/jobannonce/123",
    );
  });

  it("keeps using application links for other sources", () => {
    const job = createJob({
      source: "linkedin",
      jobUrl: "https://www.linkedin.com/jobs/view/123",
      applicationLink: "https://company.example/apply/123",
    });

    expect(getJobListingUrl(job)).toBe("https://company.example/apply/123");
  });
});
