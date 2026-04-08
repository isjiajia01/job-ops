import { describe, expect, it } from "vitest";
import { rankPayloadCandidates } from "./ghostwriter-ranking";

describe("ghostwriter ranking", () => {
  it("prefers candidates without out-of-bounds evidence penalties", () => {
    const profile = { basics: { name: "Jiajia" } } as never;
    const knowledgeBase = { personalFacts: [], projects: [], writingPreferences: [] } as never;
    const ranked = rankPayloadCandidates({
      candidates: [
        {
          response: "I built the 22.04 fresh solver thesis workflow and turned results into decision-useful outputs.",
          coverLetterDraft: null,
          coverLetterKind: null,
          resumePatch: null,
          evidenceSelection: {
            leadModuleId: "fresh-solver",
            leadModuleLabel: "22.04 fresh solver",
            allowedModuleIds: ["fresh-solver"],
            allowedModuleLabels: ["22.04 fresh solver"],
            blockedClaims: [],
            requiredEvidenceSnippets: [],
            selectionRationale: [],
          },
        },
        {
          response: "I led fresh solver and also deployed a production warehouse optimization platform for three countries.",
          coverLetterDraft: null,
          coverLetterKind: null,
          resumePatch: null,
          evidenceSelection: {
            leadModuleId: "fresh-solver",
            leadModuleLabel: "22.04 fresh solver",
            allowedModuleIds: ["fresh-solver"],
            allowedModuleLabels: ["22.04 fresh solver"],
            blockedClaims: ["Do not claim production platform ownership"],
            requiredEvidenceSnippets: [],
            selectionRationale: [],
          },
        },
      ],
      evidencePackSnapshot: "Use fresh solver only. Do not claim unrelated production platform ownership.",
      profile,
      knowledgeBase,
      evidenceSelection: {
        leadModuleId: "fresh-solver",
        leadModuleLabel: "22.04 fresh solver",
        allowedModuleIds: ["fresh-solver"],
        allowedModuleLabels: ["22.04 fresh solver"],
        blockedClaims: ["Do not claim production platform ownership"],
        requiredEvidenceSnippets: [],
        selectionRationale: [],
      },
    });

    expect(ranked.winner.response).toContain("22.04 fresh solver");
    expect(ranked.ranked[0]?.candidate.response).toContain("22.04 fresh solver");
    expect(ranked.ranked).toHaveLength(2);
    expect(typeof ranked.ranked[1]?.evaluation.score).toBe("number");
  });
});
