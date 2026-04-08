import { describe, expect, it, vi } from "vitest";
import { buildHybridEvidenceSelection } from "./ghostwriter-hybrid-evidence";

function createContext() {
  return {
    evidencePack: {
      targetRoleSummary: "Operations analyst role",
      recommendedAngle: "Operations + optimization bridge",
      topEvidence: ["Built practical optimization workflow"],
      biggestGaps: ["No long corporate tenure"],
      forbiddenClaims: ["Do not overclaim production ownership"],
      experienceBank: [
        {
          id: "fresh-solver",
          label: "22.04 fresh solver",
          preferredFraming: "Optimization thesis in operational collaboration",
          strongestClaims: ["Built practical optimization workflow"],
          supportSignals: [],
          sourceType: "project",
          roleFamilyHints: [],
          score: 0.9,
        },
        {
          id: "ops-reporting",
          label: "Ops reporting",
          preferredFraming: "Decision-support reporting",
          strongestClaims: ["Turned recurring analysis into stakeholder-ready outputs"],
          supportSignals: [],
          sourceType: "project",
          roleFamilyHints: [],
          score: 0.7,
        },
      ],
    },
  };
}

describe("ghostwriter hybrid evidence selection", () => {
  it("falls back to the local plan when llm selection fails", async () => {
    const llm = { callJson: vi.fn().mockResolvedValue({ success: false, error: "boom" }) };
    const context = createContext() as never;

    const result = await buildHybridEvidenceSelection({
      llm: llm as never,
      llmConfig: { model: "gpt", provider: null, baseUrl: null, apiKey: null },
      context,
      prompt: "Write a cover letter using my strongest project",
      taskKind: "cover_letter",
      jobId: "job-1",
      signal: new AbortController().signal,
    });

    expect(result.selectedModuleIds.length).toBeGreaterThan(0);
    expect(result.blockedClaims).toContain("Do not overclaim production ownership");
  });

  it("merges llm-approved module ids and naturalness notes into the plan", async () => {
    const llm = {
      callJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          selectedModuleIds: ["fresh-solver", "ops-reporting"],
          blockedClaims: ["Avoid inflated ownership claims"],
          selectionRationale: ["fresh solver is the best lead proof point"],
          naturalnessNotes: ["Keep the wording direct and restrained"],
        },
      }),
    };
    const context = createContext() as never;

    const result = await buildHybridEvidenceSelection({
      llm: llm as never,
      llmConfig: { model: "gpt", provider: null, baseUrl: null, apiKey: null },
      context,
      prompt: "Write a cover letter using my strongest project",
      taskKind: "cover_letter",
      jobId: "job-1",
      signal: new AbortController().signal,
    });

    expect(result.selectedModuleIds).toContain("fresh-solver");
    expect(result.selectionRationale.join(" ")).toContain("best lead proof point");
    expect(result.writerInstructions.join(" ")).toContain("direct and restrained");
    expect(result.blockedClaims.join(" ")).toContain("Avoid inflated ownership claims");
  });
});
