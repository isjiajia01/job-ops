import { describe, expect, it, vi } from "vitest";
import {
  chunkText,
  estimateTokenCount,
  handleRunFailure,
  isRunningRunUniqueConstraintError,
  streamStructuredPayload,
} from "./ghostwriter-run-lifecycle";

describe("ghostwriter run lifecycle", () => {
  it("chunks text and estimates tokens", () => {
    expect(chunkText("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
    expect(estimateTokenCount("12345678")).toBe(2);
    expect(isRunningRunUniqueConstraintError(new Error("idx_job_chat_runs_thread_running_unique"))).toBe(true);
  });

  it("streams a completed payload and emits terminal completed", async () => {
    const updateMessage = vi.fn().mockResolvedValue({ id: "msg-1", content: "done" });
    const completeRun = vi.fn().mockResolvedValue(undefined);
    const emitTimeline = vi.fn().mockResolvedValue(undefined);
    const onCompleted = vi.fn();

    const result = await streamStructuredPayload({
      run: { id: "run-1" } as never,
      assistantMessage: { id: "msg-1" } as never,
      prompt: "hello",
      payload: { response: "done", coverLetterDraft: null, coverLetterKind: null, resumePatch: null },
      signal: new AbortController().signal,
      updateMessage: updateMessage as never,
      completeRun: completeRun as never,
      emitTimeline,
      stream: { onCompleted },
    });

    expect(result.message).toContain("done");
    expect(completeRun).toHaveBeenCalledWith("run-1", { status: "completed" });
    expect(emitTimeline).toHaveBeenCalledWith(expect.objectContaining({ eventType: "completed" }));
    expect(onCompleted).toHaveBeenCalled();
  });

  it("maps failures into run failure handling", async () => {
    const updateMessage = vi.fn().mockResolvedValue({ id: "msg-1", content: "partial" });
    const completeRun = vi.fn().mockResolvedValue(undefined);
    const emitTimeline = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await expect(
      handleRunFailure({
        run: { id: "run-1" } as never,
        assistantMessage: { id: "msg-1" } as never,
        prompt: "hello",
        accumulated: "partial",
        signal: new AbortController().signal,
        error: new Error("upstream broke"),
        requestId: "req-1",
        updateMessage: updateMessage as never,
        completeRun: completeRun as never,
        emitTimeline,
        stream: { onError },
      }),
    ).rejects.toThrow("upstream broke");

    expect(completeRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "failed" }));
    expect(emitTimeline).toHaveBeenCalledWith(expect.objectContaining({ eventType: "failed" }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "UPSTREAM_ERROR" }));
  });
});
