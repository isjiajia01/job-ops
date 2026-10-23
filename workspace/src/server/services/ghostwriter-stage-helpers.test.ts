import { describe, expect, it, vi } from "vitest";
import {
  buildBaseLlmMessages,
  emitRunTimelineEvent,
} from "./ghostwriter-stage-helpers";

describe("ghostwriter stage helpers", () => {
  it("builds base LLM messages in the expected order", () => {
    const messages = buildBaseLlmMessages({
      systemPrompt: "system prompt",
      jobSnapshot: '{"job":1}',
      profileSnapshot: "profile snapshot",
      companyResearchSnapshot: "company research",
      evidencePackSnapshot: "evidence pack",
      history: [{ role: "user", content: "hello" }],
    });

    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "system",
      "system",
      "system",
      "system",
      "user",
    ]);
    expect(messages[0]?.content).toContain("system prompt");
    expect(messages[4]?.content).toContain("Evidence Pack");
  });

  it("persists and emits timeline events through the helper wrapper", async () => {
    const createRunEvent = vi.fn().mockResolvedValue({
      id: "event-1",
      runId: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      sequence: 1,
      phase: "run",
      eventType: "status",
      title: "Run started",
      detail: "detail",
      createdAt: Date.now(),
      payload: { requestId: "req-1", assistantMessageId: "assistant-1", model: "m", provider: "p" },
    });
    const onTimeline = vi.fn();

    const event = await emitRunTimelineEvent({
      createRunEvent,
      onTimeline,
      run: {
        id: "run-1",
        threadId: "thread-1",
        jobId: "job-1",
        status: "running",
        model: "m",
        provider: "p",
        errorCode: null,
        errorMessage: null,
        startedAt: Date.now(),
        completedAt: null,
        requestId: "req-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      input: {
        phase: "run",
        eventType: "status",
        title: "Run started",
        detail: "detail",
        payload: { requestId: "req-1", assistantMessageId: "assistant-1", model: "m", provider: "p" },
      },
    });

    expect(createRunEvent).toHaveBeenCalledOnce();
    expect(onTimeline).toHaveBeenCalledWith({ runId: "run-1", event });
  });
});
