import { describe, expect, it, vi } from "vitest";
import {
  buildWritingPlan,
  generateStructuredCandidates,
} from "./ghostwriter-structured-writing";

function createContext() {
  return {
    job: { employer: "Mover", title: "Operations Analyst" },
    style: null,
    systemPrompt: "system",
    jobSnapshot: "job snapshot",
    profileSnapshot: "profile snapshot",
    companyResearchSnapshot: "company research",
    evidencePackSnapshot: "evidence pack snapshot",
    profile: { basics: { name: "Jiajia" } },
    knowledgeBase: { personalFacts: [], projects: [], writingPreferences: [] },
    evidencePack: {
      recommendedAngle: "Operations + optimization bridge",
      topFitReasons: ["Strong analytical fit"],
      topEvidence: ["Fresh solver thesis collaboration"],
      targetRoleFamily: "analytics-and-decision-support",
      targetRoleSummary: "Operations analyst role",
      voiceProfile: ["direct"],
      experienceFrames: [],
      evidenceStory: [],
      selectedNarrative: ["Use the thesis as lead proof point"],
      toneRecommendation: "Direct and grounded",
      biggestGaps: ["No long corporate tenure"],
      forbiddenClaims: ["Do not overclaim production ownership"],
      experienceBank: [
        {
          id: "fresh-solver",
          label: "22.04 fresh solver",
          preferredFraming: "Optimization thesis in operational collaboration",
          strongestClaims: ["Built practical optimization workflow"],
          supportSignals: ["Turned results into decision-useful outputs"],
        },
      ],
    },
  };
}

describe("ghostwriter structured writing", () => {
  it("builds writing plan with strategy, evidence selection, and claim plan", async () => {
    const llm = {
      callJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          angle: "Lead with operational optimization",
          strongestEvidence: ["fresh solver"],
          weakPoints: ["Avoid generic fit phrasing"],
          paragraphPlan: ["Opening", "Evidence", "Close"],
          tonePlan: "Direct",
          requiresClarification: false,
          clarifyingQuestions: [],
        },
      }),
    };
    const emitTimeline = vi.fn().mockResolvedValue(undefined);
    const rawContext = createContext();
    const context = rawContext as never;

    const result = await buildWritingPlan({
      llm: llm as never,
      llmConfig: { model: "gpt", provider: null, baseUrl: null, apiKey: null },
      context,
      baseMessages: [],
      runtimeMessages: [],
      prompt: "Write a cover letter",
      taskKind: "cover_letter",
      jobId: "job-1",
      signal: new AbortController().signal,
      emitTimeline,
      writingStrategySchema: { name: "strategy", schema: { type: "object", properties: {}, required: [], additionalProperties: true } },
      buildLocalWritingStrategy: () => ({
        angle: "fallback angle",
        strongestEvidence: [],
        weakPoints: [],
        paragraphPlan: [],
        tonePlan: "fallback tone",
        requiresClarification: false,
        clarifyingQuestions: [],
      }),
      buildHybridEvidenceSelection: vi.fn().mockResolvedValue({
        selectedModules: rawContext.evidencePack.experienceBank,
        selectedModuleIds: ["fresh-solver"],
        leadModuleId: "fresh-solver",
        supportModuleIds: [],
        requiredEvidenceSnippets: ["Built practical optimization workflow"],
        blockedClaims: ["Do not overclaim production ownership"],
        blockedEvidenceIds: [],
        selectionRationale: ["Best lead proof point"],
        writerInstructions: ["Stay specific"],
      } as never),
      buildGhostwriterClaimPlan: vi.fn().mockReturnValue({
        targetRoleAngle: "Operations + optimization bridge",
        openingStrategy: "Lead with proof point",
        claims: [{ id: "c1", claim: "Optimization evidence", priority: "must", evidenceSnippets: ["Built practical optimization workflow"], jdRequirement: "Optimization", evidenceIds: ["fresh-solver"], riskLevel: "low", guidance: "Stay concrete" }],
        excludedClaims: ["Overclaim ownership"],
      } as never),
    });

    expect(result.coverLetterKind).toBe("letter");
    expect(result.claimPlan.targetRoleAngle).toContain("Operations");
    expect(emitTimeline).toHaveBeenCalledTimes(3);
  });

  it("generates and ranks structured candidates", async () => {
    const llm = {
      callJson: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: { response: "Variant 1", coverLetterDraft: "Draft 1", coverLetterKind: "letter" },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { response: "Variant 2", coverLetterDraft: "Draft 2", coverLetterKind: "letter" },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { response: "Variant 3", coverLetterDraft: "Draft 3", coverLetterKind: "letter" },
        }),
    };
    const emitTimeline = vi.fn().mockResolvedValue(undefined);
    const rawContext = createContext();
    const context = rawContext as never;

    const ranking = await generateStructuredCandidates({
      llm: llm as never,
      llmConfig: { model: "gpt", provider: null, baseUrl: null, apiKey: null },
      context,
      runtimeState: { plan: null, toolResults: null, executionTrace: null } as never,
      baseMessages: [],
      runtimeMessages: [],
      prompt: "Write a cover letter",
      jobId: "job-1",
      signal: new AbortController().signal,
      emitTimeline,
      strategy: {
        angle: "Lead with optimization",
        strongestEvidence: ["fresh solver"],
        weakPoints: [],
        paragraphPlan: ["Open", "Evidence", "Close"],
        tonePlan: "direct",
        requiresClarification: false,
        clarifyingQuestions: [],
      },
      claimPlan: {
        targetRoleAngle: "Operations + optimization bridge",
        openingStrategy: "Lead with proof point",
        claims: [{ id: "c1", claim: "Optimization evidence", priority: "must", evidenceSnippets: ["Built practical optimization workflow"], jdRequirement: "Optimization", evidenceIds: ["fresh-solver"], riskLevel: "low", guidance: "Stay concrete" }],
        excludedClaims: [],
      } as never,
      evidenceSelection: {
        selectedModules: rawContext.evidencePack.experienceBank,
        selectedModuleIds: ["fresh-solver"],
        leadModuleId: "fresh-solver",
        supportModuleIds: [],
        requiredEvidenceSnippets: ["Built practical optimization workflow"],
        blockedClaims: [],
        blockedEvidenceIds: [],
        selectionRationale: [],
        writerInstructions: [],
      } as never,
      coverLetterKind: "letter",
      chatResponseSchema: { name: "chat", schema: { type: "object", properties: {}, required: [], additionalProperties: true } },
      rankPayloadCandidates: vi.fn().mockImplementation(({ candidates }: { candidates: Array<{ response: string }> }) => ({
        ranked: candidates.map((candidate: { response: string }, index: number) => ({
          index,
          candidate,
          evaluation: {
            score: 100 - index,
            reasons: [`reason-${index}`],
            coveredClaimIds: ["c1"],
            mustClaimCoverage: 1,
            evidenceCoverage: 1,
            penalties: [],
            diagnostics: [],
          },
        })),
        winner: candidates[0],
      })),
    });

    expect(llm.callJson).toHaveBeenCalledTimes(3);
    expect(ranking.winner.response).toBe("Variant 1");
    expect(emitTimeline).toHaveBeenCalled();
  });
});
