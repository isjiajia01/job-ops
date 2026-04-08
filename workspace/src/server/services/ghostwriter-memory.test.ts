import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveCandidateKnowledgeBase } = vi.hoisted(() => ({
  saveCandidateKnowledgeBase: vi.fn(),
}));
vi.mock("./candidate-knowledge", () => ({
  saveCandidateKnowledgeBase,
}));

import { applyMemoryUpdateForPrompt } from "./ghostwriter-memory";

describe("ghostwriter memory", () => {
  beforeEach(() => {
    saveCandidateKnowledgeBase.mockReset();
    saveCandidateKnowledgeBase.mockResolvedValue(undefined);
  });

  it("stores the mover thesis framing as project, fact, and preference", async () => {
    const result = await applyMemoryUpdateForPrompt({
      prompt: "Remember this: my DTU master's thesis was done in collaboration with Mover on a last-mile delivery optimization problem.",
      knowledgeBase: {
        personalFacts: [],
        projects: [],
        companyResearchNotes: [],
        writingPreferences: [],
        inboxItems: [],
      } as never,
    });

    expect(result.saved).toEqual({ facts: 1, projects: 1, preferences: 1 });
    expect(result.nextKnowledgeBase?.projects[0]?.name).toContain("Mover x DTU Master's Thesis");
    expect(result.payload.response).toContain("Mover");
    expect(saveCandidateKnowledgeBase).toHaveBeenCalledOnce();
  });

  it("asks for a more specific fact when the memory prompt is empty after trimming", async () => {
    const result = await applyMemoryUpdateForPrompt({
      prompt: "记住",
      knowledgeBase: {
        personalFacts: [],
        projects: [],
        companyResearchNotes: [],
        writingPreferences: [],
        inboxItems: [],
      } as never,
    });

    expect(result.nextKnowledgeBase).toBeNull();
    expect(result.saved).toEqual({ facts: 0, projects: 0, preferences: 0 });
    expect(result.payload.response).toContain("更具体");
    expect(saveCandidateKnowledgeBase).not.toHaveBeenCalled();
  });
});
