import { describe, expect, it } from "vitest";
import { scoreGhostwriterCandidate } from "./ghostwriter-output-guard";
import { reviewGhostwriterPayload } from "./ghostwriter-reviewer";

describe("ghostwriter quality guards", () => {
  it("penalizes must-claims that are mentioned without enough grounding", () => {
    const result = scoreGhostwriterCandidate({
      payload: {
        response: "I am a strong fit for the role because I can support planning decisions.",
        coverLetterDraft: null,
        coverLetterKind: null,
        resumePatch: null,
        claimPlan: {
          targetRoleAngle: "Planning support",
          openingStrategy: "Lead with evidence",
          claims: [
            {
              id: "claim-role-fit",
              claim: "Support planning decisions",
              jdRequirement: "Planning",
              evidenceIds: ["fresh-solver"],
              evidenceSnippets: ["Rolling-horizon planning under delivery constraints"],
              priority: "must",
              riskLevel: "low",
              guidance: "Ground it in evidence",
            },
          ],
          excludedClaims: [],
          reviewerFocus: [],
        },
      },
      evidencePackText: "Rolling-horizon planning under delivery constraints.",
      profile: { basics: { name: "Jiajia" } } as never,
      knowledgeBase: { personalFacts: [], projects: [], writingPreferences: [] } as never,
      evidenceSelection: {
        leadModuleId: "fresh-solver",
        leadModuleLabel: "22.04 fresh solver",
        allowedModuleIds: ["fresh-solver"],
        allowedModuleLabels: ["22.04 fresh solver"],
        blockedClaims: [],
        requiredEvidenceSnippets: ["Rolling-horizon planning under delivery constraints"],
        selectionRationale: [],
      },
    });

    expect(result.penalties).toContain("weakly-grounded-claim:claim-role-fit");
  });

  it("flags unsupported and weakly-grounded must-claims in reviewer diagnostics", () => {
    const review = reviewGhostwriterPayload({
      payload: {
        response: "I can support planning decisions and help with the role immediately.",
        coverLetterDraft: null,
        coverLetterKind: null,
        resumePatch: null,
      },
      claimPlan: {
        targetRoleAngle: "Planning support",
        openingStrategy: "Lead with evidence",
        claims: [
          {
            id: "claim-role-fit",
            claim: "Support planning decisions",
            jdRequirement: "Planning",
            evidenceIds: ["fresh-solver"],
            evidenceSnippets: ["Rolling-horizon planning under delivery constraints"],
            priority: "must",
            riskLevel: "low",
            guidance: "Ground it in evidence",
          },
          {
            id: "claim-module-fresh-solver",
            claim: "Use 22.04 fresh solver as the lead proof point",
            jdRequirement: "Operations research",
            evidenceIds: ["fresh-solver"],
            evidenceSnippets: ["22.04 fresh solver", "Rolling-horizon planning under delivery constraints"],
            priority: "must",
            riskLevel: "low",
            guidance: "Mention the concrete project",
          },
        ],
        excludedClaims: [],
        reviewerFocus: [],
      },
      roleFamily: "planning-and-operations",
    });

    expect(review.issues.some((issue) => issue.startsWith("weakly-grounded-claim:"))).toBe(true);
    expect(review.issues.some((issue) => issue.startsWith("unsupported-claim:"))).toBe(true);
    expect(review.shouldRewrite).toBe(true);
  });
});
