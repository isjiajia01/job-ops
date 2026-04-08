import {
  badRequest,
  conflict,
  notFound,
  requestTimeout,
  upstreamError,
} from "@infra/errors";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import type {
  BranchInfo,
  CandidateKnowledgeBase,
  CandidateKnowledgeFact,
  CandidateKnowledgeProject,
  GhostwriterAssistantPayload,
  GhostwriterClaimPlan,
  GhostwriterCoverLetterKind,
  GhostwriterFitBrief,
  GhostwriterWritingPreference,
  JobChatMessage,
  JobChatRun,
  JobChatRunEvent,
  JobChatRunEventPayloadByType,
  JobChatRunEventType,
  JobChatRunPhase,
} from "@shared/types";
import {
  getGhostwriterDisplayText,
  normalizeGhostwriterAssistantPayload,
  serializeGhostwriterAssistantPayload,
} from "@shared/utils/ghostwriter";
import * as jobChatRepo from "../repositories/ghostwriter";
import * as jobsRepo from "../repositories/jobs";
import {
  getCandidateKnowledgeBase,
  saveCandidateKnowledgeBase,
} from "./candidate-knowledge";
import {
  buildJobChatPromptContext,
  type GhostwriterEvidencePack,
} from "./ghostwriter-context";
import { buildGhostwriterRuntimeState } from "./ghostwriter-runtime";
import { buildGhostwriterClaimPlan } from "./ghostwriter-claim-plan";
import {
  summarizeEvidenceSelectionPlan,
  type GhostwriterEvidenceSelectionPlan,
} from "./ghostwriter-evidence-selector";
import {
  buildEditorialRewritePrompt,
  shouldRunEditorialRewrite,
} from "./ghostwriter-editor";
import {
  diagnosticsFromIssueCodes,
  normalizeDiagnostics,
  summarizeDiagnostics,
} from "./ghostwriter-diagnostics";
import {
  buildReviewerRewritePrompt,
  reviewGhostwriterPayload,
} from "./ghostwriter-reviewer";
import { inferPreferenceFromEditedPrompt } from "./ghostwriter-learning";
import { applyMemoryUpdateForPrompt } from "./ghostwriter-memory";
import { sanitizeResumePatch } from "./ghostwriter-output-guard";
import { LlmService } from "./llm/service";
import {
  buildBaseLlmMessages,
  emitRunTimelineEvent,
  finalizePayloadCandidate,
  type GhostwriterEmitTimeline,
} from "./ghostwriter-stage-helpers";
import {
  buildWritingPlan,
  finalizeStructuredPayload,
  generateStructuredCandidates,
} from "./ghostwriter-structured-writing";
import { buildHybridEvidenceSelection } from "./ghostwriter-hybrid-evidence";
import { rankPayloadCandidates } from "./ghostwriter-ranking";
import type { JsonSchemaDefinition } from "./llm/types";
import { resolveLlmRuntimeSettings as resolveRuntimeLlmSettings } from "./modelSelection";
import { getProfile } from "./profile";

type LlmRuntimeSettings = {
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

const abortControllers = new Map<string, AbortController>();

const CHAT_RESPONSE_SCHEMA: JsonSchemaDefinition = {
  name: "job_chat_response",
  schema: {
    type: "object",
    properties: {
      response: {
        type: "string",
      },
      coverLetterDraft: {
        type: ["string", "null"],
      },
      coverLetterKind: {
        type: ["string", "null"],
        enum: ["letter", "email", null],
      },
      resumePatch: {
        type: ["object", "null"],
      },
      fitBrief: {
        type: ["object", "null"],
      },
      claimPlan: {
        type: ["object", "null"],
      },
      review: {
        type: ["object", "null"],
      },
    },
    required: ["response"],
    additionalProperties: false,
  },
};

const WRITING_STRATEGY_SCHEMA: JsonSchemaDefinition = {
  name: "job_chat_writing_strategy",
  schema: {
    type: "object",
    properties: {
      angle: { type: "string" },
      strongestEvidence: {
        type: "array",
        items: { type: "string" },
      },
      weakPoints: {
        type: "array",
        items: { type: "string" },
      },
      paragraphPlan: {
        type: "array",
        items: { type: "string" },
      },
      tonePlan: { type: "string" },
      requiresClarification: { type: "boolean" },
      clarifyingQuestions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "angle",
      "strongestEvidence",
      "weakPoints",
      "paragraphPlan",
      "tonePlan",
      "requiresClarification",
      "clarifyingQuestions",
    ],
    additionalProperties: false,
  },
};

type GhostwriterTaskKind =
  | "direct_chat"
  | "memory_update"
  | "cover_letter"
  | "application_email"
  | "resume_patch"
  | "mixed";

type WritingStrategy = {
  angle: string;
  strongestEvidence: string[];
  weakPoints: string[];
  paragraphPlan: string[];
  tonePlan: string;
  requiresClarification: boolean;
  clarifyingQuestions: string[];
};

function classifyGhostwriterTask(prompt: string): GhostwriterTaskKind {
  const normalized = prompt.toLowerCase();
  const asksCoverLetter =
    /cover[ -]?letter|motivation letter|application letter/.test(normalized);
  const asksEmail =
    /application email|apply email|email application|email draft/.test(
      normalized,
    );
  const asksResumePatch =
    /resume|cv|tailor my cv|update my cv|rewrite my cv|refresh cv/.test(
      normalized,
    );
  const asksMemoryUpdate =
    /remember this|remember that|please remember|keep this in mind|记住|记一下|以后.*写|以后.*表述|这是和.+一起做的|这个是和.+一起做的|别再写成|应该写成|frame (this|it) as|treat (this|it) as/.test(
      normalized,
    );

  if (asksMemoryUpdate && !asksCoverLetter && !asksEmail && !asksResumePatch) {
    return "memory_update";
  }
  if ((asksCoverLetter || asksEmail) && asksResumePatch) return "mixed";
  if (asksEmail) return "application_email";
  if (asksCoverLetter) return "cover_letter";
  if (asksResumePatch) return "resume_patch";
  return "direct_chat";
}

function buildLocalWritingStrategy(args: {
  taskKind: GhostwriterTaskKind;
  evidencePack: GhostwriterEvidencePack;
}): WritingStrategy {
  const { taskKind, evidencePack } = args;
  const paragraphPlan =
    taskKind === "resume_patch"
      ? [
          "Sharpen the tailored summary around the recommended angle and preferred framing.",
          "Keep the headline disciplined and close to the target role wording.",
          "Select only skills that reinforce the strongest evidence.",
        ]
      : taskKind === "application_email"
        ? [
            "Open with a direct, local, non-template note tied to the role.",
            "State the two strongest evidence-backed reasons for fit.",
            "Close briefly with what the candidate can contribute next.",
          ]
        : [
            "Open from the work or operating need, not from generic motivation language.",
            "Use the strongest selected experience first and package it with the preferred framing guidance.",
            "Use another body paragraph for a second practical contribution angle while staying modest about gaps.",
            "Close briefly with contribution-focused language.",
          ];

  return {
    angle: evidencePack.recommendedAngle,
    strongestEvidence: [
      ...evidencePack.selectedNarrative,
      ...evidencePack.voiceProfile,
      ...evidencePack.topEvidence,
      ...evidencePack.evidenceStory,
    ].slice(0, 8),
    weakPoints: evidencePack.biggestGaps,
    paragraphPlan,
    tonePlan: `${evidencePack.toneRecommendation} Role family: ${evidencePack.targetRoleFamily}. Voice cues: ${evidencePack.voiceProfile.join(" | ") || "direct, restrained, useful"}. Lead with: ${evidencePack.selectedNarrative[0] ?? evidencePack.topEvidence[0] ?? "strongest evidence-backed module"}.`,
    requiresClarification: false,
    clarifyingQuestions: [],
  };
}

function buildStrategySnapshot(strategy: WritingStrategy): string {
  return [
    `Angle: ${strategy.angle}`,
    strategy.strongestEvidence.length > 0
      ? `Strongest evidence:\n- ${strategy.strongestEvidence.join("\n- ")}`
      : null,
    strategy.weakPoints.length > 0
      ? `Weak points / caution:\n- ${strategy.weakPoints.join("\n- ")}`
      : null,
    strategy.paragraphPlan.length > 0
      ? `Paragraph plan:\n- ${strategy.paragraphPlan.join("\n- ")}`
      : null,
    `Tone plan: ${strategy.tonePlan}`,
  ]
    .filter(Boolean)
    .join("\n");
}


function estimateTokenCount(value: string): number {
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

function chunkText(value: string, maxChunk = 60): string[] {
  if (!value) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    chunks.push(value.slice(cursor, cursor + maxChunk));
    cursor += maxChunk;
  }
  return chunks;
}

function isRunningRunUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("idx_job_chat_runs_thread_running_unique") ||
    message.includes("UNIQUE constraint failed: job_chat_runs.thread_id")
  );
}

async function resolveLlmRuntimeSettings(): Promise<LlmRuntimeSettings> {
  return resolveRuntimeLlmSettings("tailoring");
}

async function applyResumePatchToJob(
  jobId: string,
  payload: NonNullable<ReturnType<typeof normalizeGhostwriterAssistantPayload>>,
  options?: {
    profile?: Awaited<ReturnType<typeof buildJobChatPromptContext>>["profile"];
    knowledgeBase?: Awaited<
      ReturnType<typeof buildJobChatPromptContext>
    >["knowledgeBase"];
  },
): Promise<void> {
  if (!payload.resumePatch) return;

  const [profile, knowledgeBase] = await Promise.all([
    options?.profile
      ? Promise.resolve(options.profile)
      : getProfile().catch(() => ({})),
    options?.knowledgeBase
      ? Promise.resolve(options.knowledgeBase)
      : getCandidateKnowledgeBase().catch(() => ({
          personalFacts: [],
          projects: [],
        })),
  ]);
  const { sanitized } = sanitizeResumePatch({
    patch: payload.resumePatch,
    profile,
    knowledgeBase,
  });
  if (!sanitized) return;

  await jobsRepo.updateJob(jobId, {
    tailoredSummary: sanitized.tailoredSummary ?? undefined,
    tailoredHeadline: sanitized.tailoredHeadline ?? undefined,
    tailoredSkills: sanitized.tailoredSkills
      ? JSON.stringify(sanitized.tailoredSkills)
      : undefined,
  });
}

async function buildConversationMessages(
  threadId: string,
  targetMessageId?: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  // If a target message is given, walk its ancestor path (branch-aware).
  // Otherwise, fall back to the active path from root.
  const messages = targetMessageId
    ? await jobChatRepo.getAncestorPath(targetMessageId)
    : await jobChatRepo.getActivePathFromRoot(threadId);

  return messages
    .filter(
      (message): message is typeof message & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .filter((message) => message.status !== "failed")
    .slice(-40)
    .map((message) => ({
      role: message.role,
      content:
        message.role === "assistant"
          ? getGhostwriterDisplayText(message.content)
          : message.content,
    }));
}

type GenerateReplyOptions = {
  jobId: string;
  threadId: string;
  prompt: string;
  replaceMessageId?: string;
  version?: number;
  /** Parent message ID for the assistant reply (i.e. the user message that triggered it). */
  parentMessageId?: string;
  stream?: {
    onReady: (payload: {
      runId: string;
      threadId: string;
      messageId: string;
      requestId: string;
    }) => void;
    onTimeline?: (payload: { runId: string; event: JobChatRunEvent }) => void;
    onDelta: (payload: {
      runId: string;
      messageId: string;
      delta: string;
    }) => void;
    onCompleted: (payload: {
      runId: string;
      message: Awaited<ReturnType<typeof jobChatRepo.getMessageById>>;
    }) => void;
    onCancelled: (payload: {
      runId: string;
      message: Awaited<ReturnType<typeof jobChatRepo.getMessageById>>;
    }) => void;
    onError: (payload: {
      runId: string;
      code: string;
      message: string;
      requestId: string;
    }) => void;
  };
};

async function ensureJobThread(jobId: string) {
  return jobChatRepo.getOrCreateThreadForJob({
    jobId,
    title: null,
  });
}

export async function createThread(input: {
  jobId: string;
  title?: string | null;
}) {
  return ensureJobThread(input.jobId);
}

export async function listThreads(jobId: string) {
  const thread = await ensureJobThread(jobId);
  return [thread];
}

async function buildBranchInfoForPath(
  messages: JobChatMessage[],
): Promise<BranchInfo[]> {
  const branches: BranchInfo[] = [];

  for (const msg of messages) {
    const { siblings, activeIndex } = await jobChatRepo.getSiblingsOf(msg.id);
    if (siblings.length > 1) {
      branches.push({
        messageId: msg.id,
        siblingIds: siblings.map((s) => s.id),
        activeIndex,
      });
    }
  }

  return branches;
}

export async function listMessages(input: {
  jobId: string;
  threadId: string;
  limit?: number;
  offset?: number;
}): Promise<{ messages: JobChatMessage[]; branches: BranchInfo[] }> {
  const thread = await jobChatRepo.getThreadForJob(input.jobId, input.threadId);
  if (!thread) {
    throw notFound("Thread not found for this job");
  }

  const messages = await jobChatRepo.getActivePathFromRoot(input.threadId);
  const branches = await buildBranchInfoForPath(messages);
  return { messages, branches };
}

export async function listMessagesForJob(input: {
  jobId: string;
  limit?: number;
  offset?: number;
}): Promise<{ messages: JobChatMessage[]; branches: BranchInfo[] }> {
  const thread = await ensureJobThread(input.jobId);
  const messages = await jobChatRepo.getActivePathFromRoot(thread.id);
  const branches = await buildBranchInfoForPath(messages);
  return { messages, branches };
}

export async function listRunsForJob(input: {
  jobId: string;
  limit?: number;
}): Promise<JobChatRun[]> {
  await ensureJobThread(input.jobId);
  return jobChatRepo.listRunsForJob(input.jobId, { limit: input.limit });
}

export async function listRunEventsForJob(input: {
  jobId: string;
  runId: string;
}): Promise<JobChatRunEvent[]> {
  const run = await jobChatRepo.getRunById(input.runId);
  if (!run || run.jobId !== input.jobId) {
    throw notFound("Run not found for this job");
  }
  return jobChatRepo.listRunEvents(input.runId);
}

type GhostwriterSelectionMeta = {
  candidateCount?: number;
  winnerReason: string;
  winningVariant?: string;
  strongestEvidence?: string[];
  coveredClaimIds?: string[];
};

type GhostwriterRunContext = Awaited<ReturnType<typeof buildJobChatPromptContext>>;
type GhostwriterRuntimeState = ReturnType<typeof buildGhostwriterRuntimeState>;

async function runDirectChatTask(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  jobId: string;
  signal: AbortSignal;
}): Promise<GhostwriterAssistantPayload> {
  const llmResult = await args.llm.callJson<{ response: string }>({
    model: args.llmConfig.model,
    messages: [
      ...args.baseMessages,
      ...args.runtimeMessages,
      {
        role: "user",
        content: args.prompt,
      },
    ],
    jsonSchema: CHAT_RESPONSE_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 300,
    jobId: args.jobId,
    signal: args.signal,
  });

  if (!llmResult.success) {
    if (args.signal.aborted) {
      throw requestTimeout("Chat generation was cancelled");
    }
    throw upstreamError("LLM generation failed", {
      reason: llmResult.error,
    });
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

async function runStructuredWritingTask(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  taskKind: Exclude<GhostwriterTaskKind, "direct_chat" | "memory_update">;
  jobId: string;
  signal: AbortSignal;
  emitTimeline: GhostwriterEmitTimeline;
}): Promise<{ structuredPayload: GhostwriterAssistantPayload; selectionMeta: GhostwriterSelectionMeta | null }> {
  const plan = await buildWritingPlan({
    ...args,
    writingStrategySchema: WRITING_STRATEGY_SCHEMA,
    buildLocalWritingStrategy,
    buildHybridEvidenceSelection,
    buildGhostwriterClaimPlan,
  });

  if (plan.strategy.requiresClarification && plan.strategy.clarifyingQuestions.length) {
    return {
      structuredPayload: {
        response: plan.strategy.clarifyingQuestions.slice(0, 3).map((question, index) => `${index + 1}. ${question}`).join("\n"),
        coverLetterDraft: null,
        coverLetterKind: null,
        resumePatch: null,
        claimPlan: plan.claimPlan,
      },
      selectionMeta: null,
    };
  }

  const ranking = await generateStructuredCandidates({
    ...args,
    strategy: plan.strategy,
    claimPlan: plan.claimPlan,
    evidenceSelection: plan.evidenceSelection,
    coverLetterKind: plan.coverLetterKind,
    chatResponseSchema: CHAT_RESPONSE_SCHEMA,
    rankPayloadCandidates,
  });
  const structuredPayload = await finalizeStructuredPayload({
    ...args,
    structuredPayload: ranking.winner,
    evidenceSelection: plan.evidenceSelection,
    chatResponseSchema: CHAT_RESPONSE_SCHEMA,
    shouldRunEditorialRewrite,
    buildEditorialRewritePrompt,
    reviewGhostwriterPayload,
    buildReviewerRewritePrompt,
  });
  const topEvaluation = ranking.ranked[0]?.evaluation;

  return {
    structuredPayload,
    selectionMeta: {
      candidateCount: ranking.ranked.length,
      winnerReason: topEvaluation?.reasons?.[0] ?? "This variant best balanced specificity, evidence density, and output usefulness.",
      winningVariant: ranking.winner.__variantName,
      strongestEvidence: structuredPayload.fitBrief?.strongestPoints.slice(0, 3) ?? args.context.evidencePack.topEvidence.slice(0, 3),
      coveredClaimIds: topEvaluation?.coveredClaimIds ?? [],
    },
  };
}

async function runAssistantReply(
  options: GenerateReplyOptions,
): Promise<{ runId: string; messageId: string; message: string }> {
  const thread = await jobChatRepo.getThreadForJob(
    options.jobId,
    options.threadId,
  );
  if (!thread) {
    throw notFound("Thread not found for this job");
  }

  const activeRun = await jobChatRepo.getActiveRunForThread(options.threadId);
  if (activeRun) {
    throw conflict("A chat generation is already running for this thread");
  }

  const [context, llmConfig, history] = await Promise.all([
    buildJobChatPromptContext(options.jobId),
    resolveLlmRuntimeSettings(),
    buildConversationMessages(options.threadId, options.parentMessageId),
  ]);

  const requestId = getRequestId() ?? "unknown";

  let run: JobChatRun;
  try {
    run = await jobChatRepo.createRun({
      threadId: options.threadId,
      jobId: options.jobId,
      model: llmConfig.model,
      provider: llmConfig.provider,
      requestId,
    });
  } catch (error) {
    if (isRunningRunUniqueConstraintError(error)) {
      throw conflict("A chat generation is already running for this thread");
    }
    throw error;
  }

  let assistantMessage: JobChatMessage;
  try {
    assistantMessage = await jobChatRepo.createMessage({
      threadId: options.threadId,
      jobId: options.jobId,
      role: "assistant",
      content: "",
      status: "partial",
      version: options.version ?? 1,
      replacesMessageId: options.replaceMessageId ?? null,
      parentMessageId: options.parentMessageId ?? null,
    });
  } catch (error) {
    await jobChatRepo.completeRun(run.id, {
      status: "failed",
      errorCode: "INTERNAL_ERROR",
      errorMessage: "Failed to create assistant message",
    });
    throw error;
  }

  const controller = new AbortController();
  abortControllers.set(run.id, controller);
  options.stream?.onReady({
    runId: run.id,
    threadId: options.threadId,
    messageId: assistantMessage.id,
    requestId,
  });
  await emitRunTimelineEvent({
    createRunEvent: jobChatRepo.createRunEvent,
    onTimeline: options.stream?.onTimeline,
    run,
    input: {
      phase: "run",
      eventType: "status",
      title: "Run started",
      detail: "Ghostwriter created a persisted run record and opened a reply stream.",
      payload: {
        requestId,
        assistantMessageId: assistantMessage.id,
        model: llmConfig.model,
        provider: llmConfig.provider,
      },
    },
  });

  let accumulated = "";

  try {
    const llm = new LlmService({
      provider: llmConfig.provider,
      baseUrl: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
    });

    const taskKind = classifyGhostwriterTask(options.prompt);
    await emitRunTimelineEvent({
      createRunEvent: jobChatRepo.createRunEvent,
      onTimeline: options.stream?.onTimeline,
      run,
      input: {
        phase: "context",
        eventType: "context_built",
        title: "Context assembled",
        detail: "Loaded the job brief, active thread history, profile context, and evidence pack for this request.",
        payload: {
          historyMessages: history.length,
          employer: context.job.employer,
          title: context.job.title,
          topFitReasons: context.evidencePack.topFitReasons.slice(0, 3),
          topEvidence: context.evidencePack.topEvidence.slice(0, 3),
        },
      },
    });
    const runtimeState = buildGhostwriterRuntimeState({
      context,
      prompt: options.prompt,
      taskKind,
    });
    await emitRunTimelineEvent({
      createRunEvent: jobChatRepo.createRunEvent,
      onTimeline: options.stream?.onTimeline,
      run,
      input: {
        phase: "runtime",
        eventType: "runtime_planned",
        title: "Runtime planned",
        detail: runtimeState.plan.deliverable,
        payload: {
          taskKind: runtimeState.plan.taskKind,
          responseMode: runtimeState.plan.responseMode,
          selectedTools: runtimeState.plan.selectedTools,
        },
      },
    });
    const baseMessages = buildBaseLlmMessages({
      systemPrompt: context.systemPrompt,
      jobSnapshot: context.jobSnapshot,
      profileSnapshot: context.profileSnapshot,
      companyResearchSnapshot: context.companyResearchSnapshot,
      evidencePackSnapshot: context.evidencePackSnapshot,
      history,
    });
    const runtimeMessages = runtimeState.systemMessages;

    let structuredPayload: GhostwriterAssistantPayload;
    let selectionMeta: GhostwriterSelectionMeta | null = null;
    const emitTimeline: GhostwriterEmitTimeline = (input) =>
      emitRunTimelineEvent({
        createRunEvent: jobChatRepo.createRunEvent,
        onTimeline: options.stream?.onTimeline,
        run,
        input,
      });

    if (taskKind === "memory_update") {
      await emitTimeline({
        phase: "memory",
        eventType: "memory_update",
        title: "Updating candidate memory",
        detail: "The request was classified as a memory/profile update instead of a drafting run.",
        payload: {
          prompt: options.prompt,
        },
      });
      const memoryUpdate = await applyMemoryUpdateForPrompt({
        prompt: options.prompt,
        knowledgeBase: context.knowledgeBase,
      });
      structuredPayload = memoryUpdate.payload;
      context.knowledgeBase =
        memoryUpdate.nextKnowledgeBase ?? context.knowledgeBase;
    } else if (taskKind === "direct_chat") {
      await emitTimeline({
        phase: "generation",
        eventType: "direct_reply",
        title: "Generating direct reply",
        detail: "Using the runtime brief to produce a concise answer or wording help response.",
        payload: {
          prompt: options.prompt,
          responseMode: runtimeState.plan.responseMode,
        },
      });
      structuredPayload = await runDirectChatTask({
        llm,
        llmConfig,
        context,
        runtimeState,
        baseMessages,
        runtimeMessages,
        prompt: options.prompt,
        jobId: options.jobId,
        signal: controller.signal,
      });
    } else {
      const structuredResult = await runStructuredWritingTask({
        llm,
        llmConfig,
        context,
        runtimeState,
        baseMessages,
        runtimeMessages,
        prompt: options.prompt,
        taskKind,
        jobId: options.jobId,
        signal: controller.signal,
        emitTimeline,
      });
      structuredPayload = structuredResult.structuredPayload;
      selectionMeta = structuredResult.selectionMeta;
    }

    await emitRunTimelineEvent({
      createRunEvent: jobChatRepo.createRunEvent,
      onTimeline: options.stream?.onTimeline,
      run,
      input: {
        phase: "finalize",
        eventType: "selection",
        title: "Final response selected",
        detail: "Ranked the generated candidate(s) and prepared the final structured assistant payload.",
        payload: {
          hasCoverLetterDraft: Boolean(structuredPayload.coverLetterDraft),
          coverLetterKind: structuredPayload.coverLetterKind,
          hasResumePatch: Boolean(structuredPayload.resumePatch),
          fitBriefStrongPoints:
            structuredPayload.fitBrief?.strongestPoints.slice(0, 3) ?? [],
          selectedOutputMode: structuredPayload.coverLetterDraft
            ? structuredPayload.coverLetterKind === "email"
              ? "application_email"
              : "cover_letter"
            : structuredPayload.resumePatch
              ? "resume_patch"
              : "direct_response",
          winnerReason:
            selectionMeta?.winnerReason ??
            "Selected the strongest available final response for this request.",
          candidateCount: selectionMeta?.candidateCount,
          winningVariant: selectionMeta?.winningVariant,
          strongestEvidence: selectionMeta?.strongestEvidence,
          coveredClaimIds: selectionMeta?.coveredClaimIds,
        },
      },
    });

    await applyResumePatchToJob(options.jobId, structuredPayload, {
      profile: context.profile,
      knowledgeBase: context.knowledgeBase,
    });

    const finalText = serializeGhostwriterAssistantPayload(structuredPayload);
    const chunks = chunkText(finalText);

    for (const chunk of chunks) {
      if (controller.signal.aborted) {
        const cancelled = await jobChatRepo.updateMessage(assistantMessage.id, {
          content: accumulated,
          status: "cancelled",
          tokensIn: estimateTokenCount(options.prompt),
          tokensOut: estimateTokenCount(accumulated),
        });
        await jobChatRepo.completeRun(run.id, {
          status: "cancelled",
          errorCode: "REQUEST_TIMEOUT",
          errorMessage: "Generation cancelled by user",
        });
        await emitRunTimelineEvent({
          createRunEvent: jobChatRepo.createRunEvent,
          onTimeline: options.stream?.onTimeline,
          run,
          input: {
            phase: "terminal",
            eventType: "cancelled",
            title: "Run cancelled",
            detail: "The operator stopped the stream before the response finished.",
            payload: {},
          },
        });
        options.stream?.onCancelled({ runId: run.id, message: cancelled });
        return {
          runId: run.id,
          messageId: assistantMessage.id,
          message: accumulated,
        };
      }

      accumulated += chunk;
      options.stream?.onDelta({
        runId: run.id,
        messageId: assistantMessage.id,
        delta: chunk,
      });
    }

    const completedMessage = await jobChatRepo.updateMessage(
      assistantMessage.id,
      {
        content: accumulated,
        status: "complete",
        tokensIn: estimateTokenCount(options.prompt),
        tokensOut: estimateTokenCount(accumulated),
      },
    );

    await jobChatRepo.completeRun(run.id, {
      status: "completed",
    });
    await emitRunTimelineEvent({
      createRunEvent: jobChatRepo.createRunEvent,
      onTimeline: options.stream?.onTimeline,
      run,
      input: {
        phase: "terminal",
        eventType: "completed",
        title: "Run completed",
        detail: "The assistant response was persisted and the stream closed cleanly.",
        payload: {
          outputChars: accumulated.length,
        },
      },
    });

    options.stream?.onCompleted({
      runId: run.id,
      message: completedMessage,
    });

    return {
      runId: run.id,
      messageId: assistantMessage.id,
      message: accumulated,
    };
  } catch (error) {
    const appError = error instanceof Error ? error : new Error(String(error));
    const isCancelled =
      controller.signal.aborted || appError.name === "AbortError";
    const status = isCancelled ? "cancelled" : "failed";
    const code = isCancelled ? "REQUEST_TIMEOUT" : "UPSTREAM_ERROR";
    const message = isCancelled
      ? "Generation cancelled by user"
      : appError.message || "Generation failed";

    const failedMessage = await jobChatRepo.updateMessage(assistantMessage.id, {
      content: accumulated,
      status: isCancelled ? "cancelled" : "failed",
      tokensIn: estimateTokenCount(options.prompt),
      tokensOut: estimateTokenCount(accumulated),
    });

    await jobChatRepo.completeRun(run.id, {
      status,
      errorCode: code,
      errorMessage: message,
    });
    if (isCancelled) {
      await emitRunTimelineEvent({
        createRunEvent: jobChatRepo.createRunEvent,
        onTimeline: options.stream?.onTimeline,
        run,
        input: {
          phase: "terminal",
          eventType: "cancelled",
          title: "Run cancelled",
          detail: message,
          payload: {},
        },
      });
    } else {
      await emitRunTimelineEvent({
        createRunEvent: jobChatRepo.createRunEvent,
        onTimeline: options.stream?.onTimeline,
        run,
        input: {
          phase: "terminal",
          eventType: "failed",
          title: "Run failed",
          detail: message,
          payload: {
            code,
          },
        },
      });
    }

    if (isCancelled) {
      options.stream?.onCancelled({ runId: run.id, message: failedMessage });
      return {
        runId: run.id,
        messageId: assistantMessage.id,
        message: accumulated,
      };
    }

    options.stream?.onError({
      runId: run.id,
      code,
      message,
      requestId,
    });

    throw upstreamError(message, { runId: run.id });
  } finally {
    abortControllers.delete(run.id);
    logger.info("Job chat run finished", {
      jobId: options.jobId,
      threadId: options.threadId,
      runId: run.id,
    });
  }
}

export async function sendMessage(input: {
  jobId: string;
  threadId: string;
  content: string;
  stream?: GenerateReplyOptions["stream"];
}) {
  const content = input.content.trim();
  if (!content) {
    throw badRequest("Message content is required");
  }

  const thread = await jobChatRepo.getThreadForJob(input.jobId, input.threadId);
  if (!thread) {
    throw notFound("Thread not found for this job");
  }

  // Determine parent: last message on the current active path
  const activePath = await jobChatRepo.getActivePathFromRoot(input.threadId);
  const parentId =
    activePath.length > 0 ? activePath[activePath.length - 1].id : null;

  const userMessage = await jobChatRepo.createMessage({
    threadId: input.threadId,
    jobId: input.jobId,
    role: "user",
    content,
    status: "complete",
    tokensIn: estimateTokenCount(content),
    tokensOut: null,
    parentMessageId: parentId,
  });

  // Update parent's activeChildId to point to this new user message
  if (parentId) {
    await jobChatRepo.setActiveChild(parentId, userMessage.id);
  } else {
    // First message in thread — set as active root
    await jobChatRepo.setActiveRoot(input.threadId, userMessage.id);
  }

  const result = await runAssistantReply({
    jobId: input.jobId,
    threadId: input.threadId,
    prompt: content,
    parentMessageId: userMessage.id,
    stream: input.stream,
  });

  // Update user message's activeChildId to point to the assistant reply
  await jobChatRepo.setActiveChild(userMessage.id, result.messageId);

  const assistantMessage = await jobChatRepo.getMessageById(result.messageId);
  return {
    userMessage,
    assistantMessage,
    runId: result.runId,
  };
}

export async function sendMessageForJob(input: {
  jobId: string;
  content: string;
  stream?: GenerateReplyOptions["stream"];
}) {
  const thread = await ensureJobThread(input.jobId);
  return sendMessage({
    jobId: input.jobId,
    threadId: thread.id,
    content: input.content,
    stream: input.stream,
  });
}

export async function regenerateMessage(input: {
  jobId: string;
  threadId: string;
  assistantMessageId: string;
  stream?: GenerateReplyOptions["stream"];
}) {
  const thread = await jobChatRepo.getThreadForJob(input.jobId, input.threadId);
  if (!thread) {
    throw notFound("Thread not found for this job");
  }

  const target = await jobChatRepo.getMessageById(input.assistantMessageId);
  if (
    !target ||
    target.threadId !== input.threadId ||
    target.jobId !== input.jobId
  ) {
    throw notFound("Assistant message not found for this thread");
  }

  if (target.role !== "assistant") {
    throw badRequest("Only assistant messages can be regenerated");
  }

  // Find the parent user message (the user message that prompted this assistant reply).
  // With branching, the parent is stored directly in parentMessageId.
  let parentUserMessage: JobChatMessage | null = null;
  if (target.parentMessageId) {
    parentUserMessage = await jobChatRepo.getMessageById(
      target.parentMessageId,
    );
  }

  // Fallback for legacy messages without parentMessageId: walk backwards in time
  if (!parentUserMessage || parentUserMessage.role !== "user") {
    const messages = await jobChatRepo.listMessagesForThread(input.threadId, {
      limit: 200,
    });
    const targetIndex = messages.findIndex(
      (message) => message.id === target.id,
    );
    parentUserMessage =
      targetIndex > 0
        ? ([...messages.slice(0, targetIndex)]
            .reverse()
            .find((message) => message.role === "user") ?? null)
        : null;
  }

  if (!parentUserMessage) {
    throw badRequest("Could not find a user message to regenerate from");
  }

  // Create a new sibling assistant message with the same parent (the user message)
  const result = await runAssistantReply({
    jobId: input.jobId,
    threadId: input.threadId,
    prompt: parentUserMessage.content,
    replaceMessageId: target.id,
    version: (target.version || 1) + 1,
    parentMessageId: parentUserMessage.id,
    stream: input.stream,
  });

  // Update parent's activeChildId to the new assistant message (switch to new branch)
  await jobChatRepo.setActiveChild(parentUserMessage.id, result.messageId);

  const assistantMessage = await jobChatRepo.getMessageById(result.messageId);

  return {
    runId: result.runId,
    assistantMessage,
  };
}

export async function regenerateMessageForJob(input: {
  jobId: string;
  assistantMessageId: string;
  stream?: GenerateReplyOptions["stream"];
}) {
  const thread = await ensureJobThread(input.jobId);
  return regenerateMessage({
    jobId: input.jobId,
    threadId: thread.id,
    assistantMessageId: input.assistantMessageId,
    stream: input.stream,
  });
}

export async function editMessage(input: {
  jobId: string;
  threadId: string;
  messageId: string;
  content: string;
  stream?: GenerateReplyOptions["stream"];
}) {
  const content = input.content.trim();
  if (!content) {
    throw badRequest("Message content is required");
  }

  const thread = await jobChatRepo.getThreadForJob(input.jobId, input.threadId);
  if (!thread) {
    throw notFound("Thread not found for this job");
  }

  const target = await jobChatRepo.getMessageById(input.messageId);
  if (
    !target ||
    target.threadId !== input.threadId ||
    target.jobId !== input.jobId
  ) {
    throw notFound("Message not found for this thread");
  }

  if (target.role !== "user") {
    throw badRequest("Only user messages can be edited");
  }

  const currentKnowledgeBase = await getCandidateKnowledgeBase().catch(
    () => null,
  );
  const learnedKnowledgeBase = currentKnowledgeBase
    ? inferPreferenceFromEditedPrompt({
        original: target.content,
        edited: content,
        knowledgeBase: currentKnowledgeBase,
      })
    : null;
  if (learnedKnowledgeBase) {
    await saveCandidateKnowledgeBase(learnedKnowledgeBase);
  }

  // Create a new sibling user message (same parent as the original)
  const newUserMessage = await jobChatRepo.createMessage({
    threadId: input.threadId,
    jobId: input.jobId,
    role: "user",
    content,
    status: "complete",
    tokensIn: estimateTokenCount(content),
    tokensOut: null,
    parentMessageId: target.parentMessageId,
  });

  // Update the grandparent's activeChildId to point to the new user message
  if (target.parentMessageId) {
    await jobChatRepo.setActiveChild(target.parentMessageId, newUserMessage.id);
  } else {
    // Editing a root message — set the new message as active root
    await jobChatRepo.setActiveRoot(input.threadId, newUserMessage.id);
  }

  // Generate assistant reply as a child of the new user message
  const result = await runAssistantReply({
    jobId: input.jobId,
    threadId: input.threadId,
    prompt: content,
    parentMessageId: newUserMessage.id,
    stream: input.stream,
  });

  // Update new user message's activeChildId to the assistant reply
  await jobChatRepo.setActiveChild(newUserMessage.id, result.messageId);

  const assistantMessage = await jobChatRepo.getMessageById(result.messageId);
  return {
    userMessage: newUserMessage,
    assistantMessage,
    runId: result.runId,
  };
}

export async function editMessageForJob(input: {
  jobId: string;
  messageId: string;
  content: string;
  stream?: GenerateReplyOptions["stream"];
}) {
  const thread = await ensureJobThread(input.jobId);
  return editMessage({
    jobId: input.jobId,
    threadId: thread.id,
    messageId: input.messageId,
    content: input.content,
    stream: input.stream,
  });
}

export async function switchBranch(input: {
  jobId: string;
  threadId: string;
  messageId: string;
}): Promise<{ messages: JobChatMessage[]; branches: BranchInfo[] }> {
  const thread = await jobChatRepo.getThreadForJob(input.jobId, input.threadId);
  if (!thread) {
    throw notFound("Thread not found for this job");
  }

  const target = await jobChatRepo.getMessageById(input.messageId);
  if (
    !target ||
    target.threadId !== input.threadId ||
    target.jobId !== input.jobId
  ) {
    throw notFound("Message not found for this thread");
  }

  if (target.parentMessageId) {
    // Update the parent's activeChildId to point to this sibling
    await jobChatRepo.setActiveChild(target.parentMessageId, target.id);
  } else {
    // Switching between root messages
    await jobChatRepo.setActiveRoot(input.threadId, target.id);
  }

  // Return the updated active path
  return listMessages({
    jobId: input.jobId,
    threadId: input.threadId,
  });
}

export async function switchBranchForJob(input: {
  jobId: string;
  messageId: string;
}): Promise<{ messages: JobChatMessage[]; branches: BranchInfo[] }> {
  const thread = await ensureJobThread(input.jobId);
  return switchBranch({
    jobId: input.jobId,
    threadId: thread.id,
    messageId: input.messageId,
  });
}

export async function cancelRun(input: {
  jobId: string;
  threadId: string;
  runId: string;
}): Promise<{ cancelled: boolean; alreadyFinished: boolean }> {
  const run = await jobChatRepo.getRunById(input.runId);
  if (!run || run.threadId !== input.threadId || run.jobId !== input.jobId) {
    throw notFound("Run not found for this thread");
  }

  if (run.status !== "running") {
    return {
      cancelled: false,
      alreadyFinished: true,
    };
  }

  const controller = abortControllers.get(input.runId);
  if (controller) {
    controller.abort();
  }

  const runAfterCancel = await jobChatRepo.completeRunIfRunning(input.runId, {
    status: "cancelled",
    errorCode: "REQUEST_TIMEOUT",
    errorMessage: "Generation cancelled by user",
  });

  if (!runAfterCancel || runAfterCancel.status !== "cancelled") {
    return {
      cancelled: false,
      alreadyFinished: true,
    };
  }

  return {
    cancelled: true,
    alreadyFinished: false,
  };
}

export async function resetConversationForJob(input: {
  jobId: string;
}): Promise<{ deletedMessages: number; deletedRuns: number }> {
  const thread = await ensureJobThread(input.jobId);

  const activeRun = await jobChatRepo.getActiveRunForThread(thread.id);
  if (activeRun) {
    const controller = abortControllers.get(activeRun.id);
    if (controller) {
      controller.abort();
    }
    await jobChatRepo.completeRunIfRunning(activeRun.id, {
      status: "cancelled",
      errorCode: "REQUEST_TIMEOUT",
      errorMessage: "Conversation reset by user",
    });
  }

  const deletedMessages = await jobChatRepo.deleteAllMessagesForThread(
    thread.id,
  );
  const deletedRuns = await jobChatRepo.deleteAllRunsForThread(thread.id);

  logger.info("Ghostwriter conversation reset", {
    jobId: input.jobId,
    threadId: thread.id,
    deletedMessages,
    deletedRuns,
  });

  return { deletedMessages, deletedRuns };
}

export async function cancelRunForJob(input: {
  jobId: string;
  runId: string;
}): Promise<{ cancelled: boolean; alreadyFinished: boolean }> {
  const thread = await ensureJobThread(input.jobId);
  return cancelRun({
    jobId: input.jobId,
    threadId: thread.id,
    runId: input.runId,
  });
}
