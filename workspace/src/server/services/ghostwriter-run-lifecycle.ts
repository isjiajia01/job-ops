import { logger } from "@infra/logger";
import { upstreamError } from "@infra/errors";
import type { JobChatMessage, JobChatRun } from "@shared/types";
import { serializeGhostwriterAssistantPayload } from "@shared/utils/ghostwriter";
import type * as jobChatRepo from "../repositories/ghostwriter";
import type { GhostwriterEmitTimeline } from "./ghostwriter-stage-helpers";
import type { GhostwriterAssistantPayload } from "@shared/types";

export function estimateTokenCount(value: string): number {
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

export function chunkText(value: string, maxChunk = 60): string[] {
  if (!value) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    chunks.push(value.slice(cursor, cursor + maxChunk));
    cursor += maxChunk;
  }
  return chunks;
}

export function isRunningRunUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("idx_job_chat_runs_thread_running_unique") ||
    message.includes("UNIQUE constraint failed: job_chat_runs.thread_id")
  );
}

export async function streamStructuredPayload(args: {
  run: JobChatRun;
  assistantMessage: JobChatMessage;
  prompt: string;
  payload: GhostwriterAssistantPayload;
  signal: AbortSignal;
  updateMessage: typeof jobChatRepo.updateMessage;
  completeRun: typeof jobChatRepo.completeRun;
  emitTimeline: GhostwriterEmitTimeline;
  stream?: {
    onDelta?: (payload: { runId: string; messageId: string; delta: string }) => void;
    onCompleted?: (payload: { runId: string; message: Awaited<ReturnType<typeof jobChatRepo.getMessageById>> }) => void;
    onCancelled?: (payload: { runId: string; message: Awaited<ReturnType<typeof jobChatRepo.getMessageById>> }) => void;
  };
}): Promise<{ message: string; completedMessage?: Awaited<ReturnType<typeof jobChatRepo.getMessageById>> }> {
  const finalText = serializeGhostwriterAssistantPayload(args.payload);
  const chunks = chunkText(finalText);
  let accumulated = "";

  for (const chunk of chunks) {
    if (args.signal.aborted) {
      const cancelled = await args.updateMessage(args.assistantMessage.id, {
        content: accumulated,
        status: "cancelled",
        tokensIn: estimateTokenCount(args.prompt),
        tokensOut: estimateTokenCount(accumulated),
      });
      await args.completeRun(args.run.id, {
        status: "cancelled",
        errorCode: "REQUEST_TIMEOUT",
        errorMessage: "Generation cancelled by user",
      });
      await args.emitTimeline({
        phase: "terminal",
        eventType: "cancelled",
        title: "Run cancelled",
        detail: "The operator stopped the stream before the response finished.",
        payload: {},
      });
      args.stream?.onCancelled?.({ runId: args.run.id, message: cancelled });
      return { message: accumulated };
    }

    accumulated += chunk;
    args.stream?.onDelta?.({
      runId: args.run.id,
      messageId: args.assistantMessage.id,
      delta: chunk,
    });
  }

  const completedMessage = await args.updateMessage(args.assistantMessage.id, {
    content: accumulated,
    status: "complete",
    tokensIn: estimateTokenCount(args.prompt),
    tokensOut: estimateTokenCount(accumulated),
  });

  await args.completeRun(args.run.id, { status: "completed" });
  await args.emitTimeline({
    phase: "terminal",
    eventType: "completed",
    title: "Run completed",
    detail: "The assistant response was persisted and the stream closed cleanly.",
    payload: { outputChars: accumulated.length },
  });
  args.stream?.onCompleted?.({ runId: args.run.id, message: completedMessage });

  return { message: accumulated, completedMessage };
}

export async function handleRunFailure(args: {
  run: JobChatRun;
  assistantMessage: JobChatMessage;
  prompt: string;
  accumulated: string;
  signal: AbortSignal;
  error: unknown;
  requestId: string;
  updateMessage: typeof jobChatRepo.updateMessage;
  completeRun: typeof jobChatRepo.completeRun;
  emitTimeline: GhostwriterEmitTimeline;
  stream?: {
    onCancelled?: (payload: { runId: string; message: Awaited<ReturnType<typeof jobChatRepo.getMessageById>> }) => void;
    onError?: (payload: { runId: string; code: string; message: string; requestId: string }) => void;
  };
}): Promise<{ runId: string; messageId: string; message: string }> {
  const appError = args.error instanceof Error ? args.error : new Error(String(args.error));
  const isCancelled = args.signal.aborted || appError.name === "AbortError";
  const status = isCancelled ? "cancelled" : "failed";
  const code = isCancelled ? "REQUEST_TIMEOUT" : "UPSTREAM_ERROR";
  const message = isCancelled ? "Generation cancelled by user" : appError.message || "Generation failed";

  const failedMessage = await args.updateMessage(args.assistantMessage.id, {
    content: args.accumulated,
    status: isCancelled ? "cancelled" : "failed",
    tokensIn: estimateTokenCount(args.prompt),
    tokensOut: estimateTokenCount(args.accumulated),
  });

  await args.completeRun(args.run.id, {
    status,
    errorCode: code,
    errorMessage: message,
  });

  await args.emitTimeline({
    phase: "terminal",
    eventType: isCancelled ? "cancelled" : "failed",
    title: isCancelled ? "Run cancelled" : "Run failed",
    detail: message,
    payload: isCancelled ? {} : { code },
  });

  if (isCancelled) {
    args.stream?.onCancelled?.({ runId: args.run.id, message: failedMessage });
    return { runId: args.run.id, messageId: args.assistantMessage.id, message: args.accumulated };
  }

  args.stream?.onError?.({ runId: args.run.id, code, message, requestId: args.requestId });
  throw upstreamError(message, { runId: args.run.id });
}

export function logRunFinished(args: { jobId: string; threadId: string; runId: string }) {
  logger.info("Job chat run finished", args);
}
