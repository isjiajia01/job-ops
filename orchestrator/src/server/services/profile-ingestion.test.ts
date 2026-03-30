import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callJson: vi.fn(),
  resolveLlmRuntimeSettings: vi.fn(),
  getProfile: vi.fn(),
  getCandidateKnowledgeBase: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock("./llm/service", () => ({
  LlmService: class {
    callJson = mocks.callJson;
  },
}));

vi.mock("./modelSelection", () => ({
  resolveLlmRuntimeSettings: mocks.resolveLlmRuntimeSettings,
}));

vi.mock("./profile", () => ({
  getProfile: mocks.getProfile,
}));

vi.mock("./candidate-knowledge", () => ({
  getCandidateKnowledgeBase: mocks.getCandidateKnowledgeBase,
}));

vi.stubGlobal("crypto", {
  randomUUID: mocks.randomUUID,
});

import { ingestProfileCapture } from "./profile-ingestion";

describe("profile-ingestion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.randomUUID.mockReturnValue("generated-id");
    mocks.resolveLlmRuntimeSettings.mockResolvedValue({
      model: "test-model",
      provider: "openrouter",
      baseUrl: "https://example.com",
      apiKey: "test-key",
    });
    mocks.getProfile.mockResolvedValue({
      basics: {
        headline: "Planning analytics candidate",
        summary: "Strong in planning, Python, and decision support.",
      },
    });
    mocks.getCandidateKnowledgeBase.mockResolvedValue({
      personalFacts: [],
      projects: [],
      writingPreferences: [],
      inboxItems: [],
    });
  });

  it("returns LLM-enriched inbox items when the model responds successfully", async () => {
    mocks.callJson.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            kind: "project",
            title: "Rolling-horizon planning simulator",
            summary: "Built a simulator for rolling-horizon route planning.",
            tags: ["planning", "python", "or-tools"],
            confidence: "high",
            suggestedFact: null,
            suggestedProject: {
              name: "Rolling-horizon planning simulator",
              summary: "Built a simulator for rolling-horizon route planning.",
              keywords: ["planning", "python", "or-tools"],
              role: "Thesis project",
              impact: "Strong evidence for planning-heavy roles.",
              roleRelevance: "Supports route planning and operations analytics roles.",
            },
            suggestedPreference: null,
          },
        ],
      },
    });

    const result = await ingestProfileCapture({
      rawText:
        "I built a rolling-horizon route-planning simulator in Python and OR-Tools for my thesis.",
      sourceLabel: "self note",
    });

    expect(result.mode).toBe("llm");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "project",
      title: "Rolling-horizon planning simulator",
      sourceLabel: "self note",
      confidence: "high",
      suggestedProject: {
        role: "Thesis project",
        impact: "Strong evidence for planning-heavy roles.",
      },
    });
  });

  it("normalizes looser LLM payloads instead of falling back immediately", async () => {
    mocks.callJson.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            title: "Route planning simulator",
            summary: "Built a route-planning simulator for thesis work.",
            tags: ["planning", "python"],
            confidence: "high",
            suggestedProject: {
              name: "Route planning simulator",
              keywords: ["planning", "python"],
              role: "Thesis project",
              impact: "Strong planning signal",
              roleRelevance: "Useful for planning-heavy roles",
            },
          },
        ],
      },
    });

    const result = await ingestProfileCapture({
      rawText:
        "I built a route-planning simulator in Python for my thesis and want it used for planning roles.",
      sourceLabel: "self note",
    });

    expect(result.mode).toBe("llm");
    expect(result.items[0]).toMatchObject({
      kind: "project",
      suggestedProject: {
        summary: "Built a route-planning simulator for thesis work.",
      },
    });
  });

  it("falls back to heuristic ingestion when the LLM fails", async () => {
    mocks.callJson.mockResolvedValue({
      success: false,
      error: "LLM unavailable",
    });

    const result = await ingestProfileCapture({
      rawText:
        "I prefer Ghostwriter to sound direct and practical. Do not overclaim senior ownership.",
      sourceLabel: "feedback",
    });

    expect(result.mode).toBe("fallback");
    expect(result.items[0]).toMatchObject({
      kind: "preference",
      sourceLabel: "feedback",
      suggestedPreference: {
        kind: "guardrail",
      },
    });
  });
});
