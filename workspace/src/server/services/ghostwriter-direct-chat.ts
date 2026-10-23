import { requestTimeout, upstreamError } from "@infra/errors";
import type { GhostwriterAssistantPayload } from "@shared/types";
import type { LlmService } from "./llm/service";
import type { JsonSchemaDefinition } from "./llm/types";
import type { buildJobChatPromptContext } from "./ghostwriter-context";
import type { buildGhostwriterRuntimeState } from "./ghostwriter-runtime";
import { finalizePayloadCandidate } from "./ghostwriter-stage-helpers";

type GhostwriterRunContext = Awaited<ReturnType<typeof buildJobChatPromptContext>>;
type GhostwriterRuntimeState = ReturnType<typeof buildGhostwriterRuntimeState>;
type LlmRuntimeSettings = {
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

export async function runDirectChatTask(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  jobId: string;
  signal: AbortSignal;
  chatResponseSchema: JsonSchemaDefinition;
}): Promise<GhostwriterAssistantPayload> {
  const llmResult = await args.llm.callJson<{ response: string }>({
    model: args.llmConfig.model,
    messages: [
      ...args.baseMessages,
      ...args.runtimeMessages,
      { role: "user", content: args.prompt },
    ],
    jsonSchema: args.chatResponseSchema,
    maxRetries: 1,
    retryDelayMs: 300,
    jobId: args.jobId,
    signal: args.signal,
  });

  if (!llmResult.success) {
    if (args.signal.aborted) throw requestTimeout("Chat generation was cancelled");
    throw upstreamError("LLM generation failed", { reason: llmResult.error });
  }

  return finalizePayloadCandidate({
    raw: llmResult.data,
    prompt: args.prompt,
    profile: args.context.profile,
    knowledgeBase: args.context.knowledgeBase,
    evidencePack: args.context.evidencePack,
    runtimeState: args.runtimeState,
  });
}
