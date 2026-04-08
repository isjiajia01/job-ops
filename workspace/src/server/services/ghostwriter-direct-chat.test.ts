import { describe, expect, it, vi } from "vitest";
import { runDirectChatTask } from "./ghostwriter-direct-chat";

describe("ghostwriter direct chat", () => {
  it("preserves runtime state in the finalized payload", async () => {
    const llm = {
      callJson: vi.fn().mockResolvedValue({
        success: true,
        data: { response: "Here is a concise answer." },
      }),
    };

    const result = await runDirectChatTask({
      llm: llm as never,
      llmConfig: { model: "gpt", provider: null, baseUrl: null, apiKey: null },
      context: {
        profile: { basics: { name: "Jiajia" } },
        knowledgeBase: { personalFacts: [], projects: [], writingPreferences: [] },
        evidencePack: {
          recommendedAngle: "Angle",
          topFitReasons: [],
          topEvidence: [],
          biggestGaps: [],
          forbiddenClaims: [],
        },
      } as never,
      runtimeState: {
        plan: { taskKind: "direct_chat" },
        toolResults: [{ tool: "context", summary: "used context" }],
        executionTrace: [{ label: "context", detail: "loaded", status: "done" }],
      } as never,
      baseMessages: [],
      runtimeMessages: [],
      prompt: "Help me phrase this better",
      jobId: "job-1",
      signal: new AbortController().signal,
      chatResponseSchema: { name: "chat", schema: { type: "object", properties: {}, required: [], additionalProperties: true } },
    });

    expect(result.response).toContain("concise answer");
    expect(result.runtimePlan).toEqual({ taskKind: "direct_chat" });
    expect(result.toolTrace?.length).toBe(1);
    expect(result.executionTrace?.length).toBe(1);
  });

  it("throws upstream error when the llm call fails", async () => {
    const llm = {
      callJson: vi.fn().mockResolvedValue({ success: false, error: "bad upstream" }),
    };

    await expect(
      runDirectChatTask({
        llm: llm as never,
        llmConfig: { model: "gpt", provider: null, baseUrl: null, apiKey: null },
        context: { profile: {}, knowledgeBase: { personalFacts: [], projects: [], writingPreferences: [] }, evidencePack: {} } as never,
        runtimeState: { plan: null, toolResults: null, executionTrace: null } as never,
        baseMessages: [],
        runtimeMessages: [],
        prompt: "Help me phrase this better",
        jobId: "job-1",
        signal: new AbortController().signal,
        chatResponseSchema: { name: "chat", schema: { type: "object", properties: {}, required: [], additionalProperties: true } },
      }),
    ).rejects.toThrow("LLM generation failed");
  });
});
