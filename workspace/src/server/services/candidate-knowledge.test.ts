import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  },
  randomUUID: vi.fn(),
}));

vi.mock("../repositories/settings", () => ({
  getSetting: mocks.settings.getSetting,
  setSetting: mocks.settings.setSetting,
}));

vi.stubGlobal("crypto", {
  randomUUID: mocks.randomUUID,
});

import {
  addCandidateKnowledgeFact,
  addCandidateKnowledgeProject,
  getCandidateKnowledgeBase,
} from "./candidate-knowledge";

describe("candidate-knowledge service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.randomUUID.mockReturnValue("generated-id");
    mocks.settings.setSetting.mockResolvedValue(undefined);
  });

  it("returns the default knowledge base when nothing is stored", async () => {
    mocks.settings.getSetting.mockResolvedValue(null);

    const result = await getCandidateKnowledgeBase();
    expect(result.personalFacts).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.companyResearchNotes ?? []).toEqual([]);
    expect(result.writingPreferences ?? []).toEqual([]);
    expect(result.inboxItems ?? []).toEqual([]);
  });

  it("adds a personal fact and persists the updated knowledge base", async () => {
    mocks.settings.getSetting.mockResolvedValue(
      JSON.stringify({ personalFacts: [], projects: [] }),
    );

    const fact = await addCandidateKnowledgeFact({
      title: "Work authorization",
      detail: "Can work in Denmark without sponsorship.",
    });

    expect(fact).toEqual({
      id: "generated-id",
      title: "Work authorization",
      detail: "Can work in Denmark without sponsorship.",
    });
    expect(mocks.settings.setSetting).toHaveBeenCalledWith(
      "candidateKnowledgeBase",
      JSON.stringify({
        personalFacts: [fact],
        projects: [],
        companyResearchNotes: [],
        writingPreferences: [],
        inboxItems: [],
      }),
    );
  });

  it("adds a project and normalizes optional fields", async () => {
    mocks.settings.getSetting.mockResolvedValue(
      JSON.stringify({ personalFacts: [], projects: [] }),
    );

    const project = await addCandidateKnowledgeProject({
      name: "Forecasting Dashboard",
      summary: "Built a supply planning dashboard.",
      keywords: ["Python", " Excel ", ""],
      cvBullets: [" Led dashboard rollout ", ""],
    });

    expect(project).toEqual({
      id: "generated-id",
      name: "Forecasting Dashboard",
      summary: "Built a supply planning dashboard.",
      keywords: ["Python", "Excel"],
      role: null,
      impact: null,
      roleRelevance: null,
      cvBullets: ["Led dashboard rollout"],
    });
  });
});
