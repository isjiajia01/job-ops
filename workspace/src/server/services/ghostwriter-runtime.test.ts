import { describe, expect, it } from "vitest";
import { buildGhostwriterRuntimeState } from "./ghostwriter-runtime";

const context = {
  job: {
    id: "job-1",
    title: "Demand Planning Analyst",
    employer: "Acme",
    location: "Copenhagen",
    jobDescription:
      "Support forecasting, supply planning, and cross-functional decision support.",
  },
  profile: {
    basics: {
      headline: "Planning and analytics candidate",
      summary: "Evidence-led operations and analytics profile.",
    },
  },
  knowledgeBase: {
    personalFacts: [
      {
        id: "fact-1",
        title: "Target roles",
        detail: "Demand planning, supply planning, and analytics roles.",
      },
    ],
    projects: [],
    companyResearchNotes: [],
    writingPreferences: [
      {
        id: "pref-1",
        label: "Direct tone",
        instruction: "Keep wording direct and low-fluff.",
        kind: "tone",
        strength: "strong",
      },
    ],
    inboxItems: [],
  },
  style: {
    tone: "professional",
    formality: "medium",
    constraints: "",
    doNotUse: "",
  },
  systemPrompt: "system",
  jobSnapshot: "job snapshot",
  profileSnapshot: "profile snapshot",
  companyResearchSnapshot: "Acme is modernising planning operations.",
  evidencePack: {
    targetRoleSummary: "Planning-heavy analytical role",
    targetRoleFamily: "planning-and-operations",
    voiceProfile: ["Direct", "Restrained"],
    topFitReasons: ["Planning fit"],
    topEvidence: ["DTU thesis", "Excel automation"],
    experienceFrames: [],
    evidenceStory: [],
    experienceBank: [
      {
        id: "module-1",
        label: "DTU thesis",
        sourceType: "knowledge_project",
        roleFamilyHints: ["planning-and-operations"],
        strongestClaims: ["Used optimisation to support planning decisions."],
        preferredFraming: "Operations-linked planning research.",
        supportSignals: ["planning", "optimisation"],
        score: 12,
      },
    ],
    selectedNarrative: ["Lead with DTU thesis"],
    biggestGaps: ["No direct SAP experience"],
    recommendedAngle: "Lead with planning-oriented problem solving.",
    forbiddenClaims: ["Do not claim senior ownership."],
    toneRecommendation: "Direct and practical.",
  },
  evidencePackSnapshot: "evidence snapshot",
} as const;

describe("ghostwriter runtime", () => {
  it("builds a claw-style runtime state with selected tools and system messages", () => {
    const state = buildGhostwriterRuntimeState({
      context: context as never,
      prompt: "Write a cover letter for this role",
      taskKind: "cover_letter",
    });

    expect(state.plan.role).toBe("Application Writing Strategist");
    expect(state.plan.selectedTools).toContain("job_brief");
    expect(state.plan.selectedTools).toContain("proof_point_bank");
    expect(state.plan.selectedTools).toContain("company_research");
    expect(state.systemMessages).toHaveLength(2);
    expect(state.systemMessages[1]?.content).toContain("Ghostwriter Runtime Tool Trace");
  });
});
