import { describe, expect, it } from "vitest";
import {
  diagnosticFromIssueCode,
  diagnosticsFromIssueCodes,
  summarizeDiagnostics,
} from "./ghostwriter-diagnostics";

describe("ghostwriter diagnostics", () => {
  it("dedupes diagnostics and keeps the highest-severity version", () => {
    const diagnostics = diagnosticsFromIssueCodes([
      "generic-opening",
      "generic-opening",
      "long-sentences:2",
      "long-sentences:2",
    ]);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]?.code).toBe("generic-opening");
    expect(diagnostics[1]?.code).toBe("long-sentences:2");
  });

  it("builds grouped summaries from normalized diagnostics", () => {
    const summary = summarizeDiagnostics([
      diagnosticFromIssueCode("generic-opening"),
      diagnosticFromIssueCode("generic-phrases:2"),
      diagnosticFromIssueCode("possible-unapproved-projects:1"),
    ]);

    expect(summary).toEqual([
      { category: "generic-language", severity: "high", count: 1 },
      { category: "evidence-boundary", severity: "medium", count: 1 },
      { category: "generic-language", severity: "medium", count: 1 },
    ]);
  });
});
