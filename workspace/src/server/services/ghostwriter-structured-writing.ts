import { requestTimeout, upstreamError } from "@infra/errors";
import type {
  CandidateKnowledgeBase,
  GhostwriterAssistantPayload,
  GhostwriterClaimPlan,
  GhostwriterCoverLetterKind,
  ResumeProfile,
} from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { summarizeEvidenceSelectionPlan, type GhostwriterEvidenceSelectionPlan } from "./ghostwriter-evidence-selector";
import { diagnosticsFromIssueCodes, normalizeDiagnostics, summarizeDiagnostics } from "./ghostwriter-diagnostics";
import type { GhostwriterEmitTimeline } from "./ghostwriter-stage-helpers";
import { attachReviewToPayload, finalizePayloadCandidate } from "./ghostwriter-stage-helpers";
import type { LlmService } from "./llm/service";
import type { buildJobChatPromptContext } from "./ghostwriter-context";
import type { buildGhostwriterRuntimeState } from "./ghostwriter-runtime";

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

type GhostwriterRunContext = Awaited<ReturnType<typeof buildJobChatPromptContext>>;
type GhostwriterRuntimeState = ReturnType<typeof buildGhostwriterRuntimeState>;
type LlmRuntimeSettings = {
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

type RankResult = {
  ranked: Array<{
    index: number;
    candidate: GhostwriterAssistantPayload & { __variantName?: string };
    evaluation: {
      score: number;
      reasons: string[];
      coveredClaimIds: string[];
      mustClaimCoverage: number;
      evidenceCoverage: number;
      penalties: string[];
      diagnostics: ReturnType<typeof normalizeDiagnostics>;
    };
  }>;
  winner: GhostwriterAssistantPayload & { __variantName?: string };
};

type ReviewResult = ReturnType<
  (args: { payload: GhostwriterAssistantPayload; claimPlan: GhostwriterClaimPlan | null | undefined; roleFamily?: string | null }) => {
    summary: string;
    scores: {
      specificity: number;
      evidenceStrength: number;
      overclaimRisk: number;
      naturalness: number;
    };
    issues: string[];
    diagnostics: ReturnType<typeof normalizeDiagnostics>;
    shouldRewrite: boolean;
  }
>;

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

function buildEvidenceSelectionSnapshot(evidenceSelection: GhostwriterEvidenceSelectionPlan): string {
  return [
    `Selected evidence ids: ${evidenceSelection.selectedModuleIds.join(", ") || "none"}`,
    evidenceSelection.selectedModules.length
      ? `Selected proof points:\n- ${evidenceSelection.selectedModules
          .map((module) => `${module.label}: ${module.preferredFraming}`)
          .join("\n- ")}`
      : "Selected proof points: none",
    evidenceSelection.requiredEvidenceSnippets.length
      ? `Required evidence snippets:\n- ${evidenceSelection.requiredEvidenceSnippets.join("\n- ")}`
      : null,
    evidenceSelection.blockedClaims.length
      ? `Blocked claims:\n- ${evidenceSelection.blockedClaims.join("\n- ")}`
      : null,
    evidenceSelection.writerInstructions.length
      ? `Writer instructions:\n- ${evidenceSelection.writerInstructions.join("\n- ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function emitReviewCompleted(
  emitTimeline: GhostwriterEmitTimeline,
  review: ReviewResult,
): Promise<void> {
  await emitTimeline({
    phase: "finalize",
    eventType: "review_completed",
    title: "Post-generation review completed",
    detail: review.summary,
    payload: {
      summary: review.summary,
      specificity: review.scores.specificity,
      evidenceStrength: review.scores.evidenceStrength,
      overclaimRisk: review.scores.overclaimRisk,
      naturalness: review.scores.naturalness,
      issues: review.issues,
      diagnostics: review.diagnostics,
      diagnosticSummary: summarizeDiagnostics(review.diagnostics),
      shouldRewrite: review.shouldRewrite,
    },
  });
}

export async function buildWritingPlan(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  taskKind: Exclude<GhostwriterTaskKind, "direct_chat" | "memory_update">;
  jobId: string;
  signal: AbortSignal;
  emitTimeline: GhostwriterEmitTimeline;
  writingStrategySchema: JsonSchemaDefinition;
  buildLocalWritingStrategy: (args: {
    taskKind: Exclude<GhostwriterTaskKind, "direct_chat" | "memory_update">;
    evidencePack: GhostwriterRunContext["evidencePack"];
  }) => WritingStrategy;
  buildHybridEvidenceSelection: (args: {
    llm: LlmService;
    llmConfig: LlmRuntimeSettings;
    context: GhostwriterRunContext;
    prompt: string;
    taskKind: GhostwriterTaskKind;
    jobId: string;
    signal: AbortSignal;
  }) => Promise<GhostwriterEvidenceSelectionPlan>;
  buildGhostwriterClaimPlan: (args: {
    context: GhostwriterRunContext;
    prompt: string;
    taskKind: Exclude<GhostwriterTaskKind, "direct_chat" | "memory_update">;
    strategy: WritingStrategy;
    evidenceSelection: GhostwriterEvidenceSelectionPlan;
  }) => GhostwriterClaimPlan;
}): Promise<{
  strategy: WritingStrategy;
  claimPlan: GhostwriterClaimPlan;
  evidenceSelection: GhostwriterEvidenceSelectionPlan;
  coverLetterKind: GhostwriterCoverLetterKind | null;
}> {
  const strategyPrompt = [
    `Task kind: ${args.taskKind}`,
    `User request: ${args.prompt}`,
    "Build a compact writing strategy using the evidence pack. Focus on the best angle, strongest evidence, weak points to manage, and a practical paragraph plan.",
    "Set requiresClarification to true only if a good draft would clearly suffer without extra user input.",
  ].join("\n\n");

  await args.emitTimeline({
    phase: "strategy",
    eventType: "strategy_requested",
    title: "Planning writing strategy",
    detail: "Ghostwriter is first building an explicit strategy before drafting the artifact.",
    payload: { prompt: args.prompt, taskKind: args.taskKind },
  });

  const strategyResult = await args.llm.callJson<WritingStrategy>({
    model: args.llmConfig.model,
    messages: [
      ...args.baseMessages,
      ...args.runtimeMessages,
      { role: "system", content: "Return a writing strategy JSON only. Do not draft the final answer yet." },
      { role: "user", content: strategyPrompt },
    ],
    jsonSchema: args.writingStrategySchema,
    maxRetries: 1,
    retryDelayMs: 300,
    jobId: args.jobId,
    signal: args.signal,
  });

  if (!strategyResult.success) {
    if (args.signal.aborted) throw requestTimeout("Chat generation was cancelled");
    throw upstreamError("Ghostwriter strategy generation failed", { reason: strategyResult.error });
  }

  const strategy = {
    ...args.buildLocalWritingStrategy({ taskKind: args.taskKind, evidencePack: args.context.evidencePack }),
    ...strategyResult.data,
  } satisfies WritingStrategy;

  await args.emitTimeline({
    phase: "strategy",
    eventType: "strategy_built",
    title: "Strategy locked",
    detail: strategy.angle,
    payload: {
      strongestEvidence: strategy.strongestEvidence.slice(0, 4),
      weakPoints: strategy.weakPoints.slice(0, 3),
      paragraphPlan: strategy.paragraphPlan.slice(0, 5),
    },
  });

  const evidenceSelection = await args.buildHybridEvidenceSelection({
    llm: args.llm,
    llmConfig: args.llmConfig,
    context: args.context,
    prompt: args.prompt,
    taskKind: args.taskKind,
    jobId: args.jobId,
    signal: args.signal,
  });
  const claimPlan = args.buildGhostwriterClaimPlan({
    context: args.context,
    prompt: args.prompt,
    taskKind: args.taskKind,
    strategy,
    evidenceSelection,
  });

  await args.emitTimeline({
    phase: "strategy",
    eventType: "claim_plan_built",
    title: "Claim plan built",
    detail: `${claimPlan.targetRoleAngle} | selected proof points: ${evidenceSelection.selectedModules.map((module) => module.label).join(", ") || "none"}`,
    payload: {
      targetRoleAngle: claimPlan.targetRoleAngle,
      openingStrategy: claimPlan.openingStrategy,
      claimCount: claimPlan.claims.length,
      mustClaimCount: claimPlan.claims.filter((claim) => claim.priority === "must").length,
      excludedClaims: claimPlan.excludedClaims.slice(0, 3),
    },
  });

  const coverLetterKind =
    args.taskKind === "application_email"
      ? "email"
      : args.taskKind === "cover_letter" || args.taskKind === "mixed"
        ? "letter"
        : null;

  return { strategy, claimPlan, evidenceSelection, coverLetterKind };
}

export async function generateStructuredCandidates(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  jobId: string;
  signal: AbortSignal;
  emitTimeline: GhostwriterEmitTimeline;
  strategy: WritingStrategy;
  claimPlan: GhostwriterClaimPlan;
  evidenceSelection: GhostwriterEvidenceSelectionPlan;
  coverLetterKind: GhostwriterCoverLetterKind | null;
  chatResponseSchema: JsonSchemaDefinition;
  rankPayloadCandidates: (args: {
    candidates: Array<GhostwriterAssistantPayload & { __variantName?: string }>;
    evidencePackSnapshot: string;
    profile: ResumeProfile;
    knowledgeBase: CandidateKnowledgeBase;
    evidenceSelection?: GhostwriterAssistantPayload["evidenceSelection"] | null;
  }) => RankResult;
}): Promise<RankResult> {
  const strategySnapshot = buildStrategySnapshot(args.strategy);
  const evidenceSelectionSnapshot = buildEvidenceSelectionSnapshot(args.evidenceSelection);
  const variantDirectives = [
    {
      name: "angle-led",
      coverLetterKind: args.coverLetterKind,
      instruction: `Variant profile: angle-led. Open from this role angle: ${args.claimPlan.targetRoleAngle}. Use this opening strategy: ${args.claimPlan.openingStrategy}`,
    },
    {
      name: "balanced",
      coverLetterKind: args.coverLetterKind,
      instruction: `Variant profile: balanced and practical. Cover these prioritized claims in order: ${args.claimPlan.claims.map((claim) => `${claim.priority}:${claim.claim}`).join(" | ")}`,
    },
    {
      name: "evidence-heavy",
      coverLetterKind: args.coverLetterKind,
      instruction: `Variant profile: maximize evidence density. Reuse these evidence snippets before adding softer framing: ${args.claimPlan.claims.flatMap((claim) => claim.evidenceSnippets).slice(0, 6).join(" | ")}`,
    },
  ] satisfies Array<{ name: string; coverLetterKind: GhostwriterCoverLetterKind | null; instruction: string }>;

  const candidatePayloads: Array<GhostwriterAssistantPayload & { __variantName?: string }> = [];

  for (const variant of variantDirectives) {
    await args.emitTimeline({
      phase: "generation",
      eventType: "variant_requested",
      title: `Drafting ${variant.name} variant`,
      detail: variant.instruction,
      payload: { variant: variant.name, coverLetterKind: variant.coverLetterKind },
    });

    const variantResult = await args.llm.callJson<GhostwriterAssistantPayload>({
      model: args.llmConfig.model,
      messages: [
        ...args.baseMessages,
        ...args.runtimeMessages,
        { role: "system", content: `Approved Writing Strategy:\n${strategySnapshot}` },
        { role: "system", content: `Approved Claim Plan:\n${JSON.stringify(args.claimPlan, null, 2)}` },
        { role: "system", content: `Approved Evidence Selection:\n${evidenceSelectionSnapshot}` },
        {
          role: "system",
          content: [
            variant.instruction,
            "Hard gate: stay inside the approved evidence selection unless the user explicitly asks to use a different project.",
            `Prefer evidence ids: ${args.evidenceSelection.selectedModuleIds.join(", ") || "none"}.`,
            args.evidenceSelection.blockedClaims.length
              ? `Never do these: ${args.evidenceSelection.blockedClaims.join(" | ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
        { role: "user", content: args.prompt },
      ],
      jsonSchema: args.chatResponseSchema,
      maxRetries: 1,
      retryDelayMs: 300,
      jobId: args.jobId,
      signal: args.signal,
    });

    if (!variantResult.success) {
      if (args.signal.aborted) throw requestTimeout("Chat generation was cancelled");
      throw upstreamError(`Ghostwriter ${variant.name} draft generation failed`, { reason: variantResult.error });
    }

    const candidate = finalizePayloadCandidate({
      raw: variantResult.data,
      prompt: args.prompt,
      profile: args.context.profile,
      knowledgeBase: args.context.knowledgeBase,
      evidencePack: args.context.evidencePack,
      runtimeState: args.runtimeState,
      claimPlan: args.claimPlan,
      evidenceSelection: args.evidenceSelection,
    });

    candidatePayloads.push({
      ...candidate,
      __variantName: variant.name,
      coverLetterKind: candidate.coverLetterDraft
        ? (candidate.coverLetterKind ?? variant.coverLetterKind)
        : candidate.coverLetterKind,
    });

    await args.emitTimeline({
      phase: "generation",
      eventType: "variant_completed",
      title: `Finished ${variant.name} variant`,
      detail: candidate.coverLetterDraft
        ? "Variant includes a drafted application artifact."
        : "Variant completed as a reply / patch candidate.",
      payload: {
        variant: variant.name,
        hasCoverLetterDraft: Boolean(candidate.coverLetterDraft),
        hasResumePatch: Boolean(candidate.resumePatch),
        responsePreview: candidate.response.slice(0, 180),
      },
    });
  }

  const ranking = args.rankPayloadCandidates({
    candidates: candidatePayloads,
    evidencePackSnapshot: args.context.evidencePackSnapshot,
    profile: args.context.profile,
    knowledgeBase: args.context.knowledgeBase,
    evidenceSelection: summarizeEvidenceSelectionPlan(args.evidenceSelection),
  });

  for (const rankedCandidate of ranking.ranked) {
    await args.emitTimeline({
      phase: "finalize",
      eventType: "variant_scored",
      title: `Scored ${rankedCandidate.candidate.__variantName ?? `variant-${rankedCandidate.index + 1}`}`,
      detail:
        rankedCandidate.evaluation.reasons.slice(0, 2).join(" · ") ||
        "Scored against evidence coverage and output quality.",
      payload: {
        variant: rankedCandidate.candidate.__variantName ?? `variant-${rankedCandidate.index + 1}`,
        finalScore: rankedCandidate.evaluation.score,
        coveredClaimIds: rankedCandidate.evaluation.coveredClaimIds,
        mustClaimCoverage: rankedCandidate.evaluation.mustClaimCoverage,
        evidenceCoverage: rankedCandidate.evaluation.evidenceCoverage,
        penalties: rankedCandidate.evaluation.penalties,
        diagnostics: rankedCandidate.evaluation.diagnostics,
        diagnosticSummary: summarizeDiagnostics(rankedCandidate.evaluation.diagnostics),
      },
    });
  }

  return ranking;
}

export async function runEditorialRewriteStage(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  jobId: string;
  signal: AbortSignal;
  emitTimeline: GhostwriterEmitTimeline;
  structuredPayload: GhostwriterAssistantPayload & { __variantName?: string };
  evidenceSelection: GhostwriterEvidenceSelectionPlan;
  chatResponseSchema: JsonSchemaDefinition;
  shouldRunEditorialRewrite: (payload: GhostwriterAssistantPayload) => { shouldRewrite: boolean; reasons: string[] };
  buildEditorialRewritePrompt: (args: {
    original: GhostwriterAssistantPayload;
    claimPlan: GhostwriterClaimPlan | null | undefined;
    triggerReasons: string[];
  }) => string;
}): Promise<GhostwriterAssistantPayload> {
  const rewriteDecision = args.shouldRunEditorialRewrite(args.structuredPayload);
  if (!rewriteDecision.shouldRewrite) return args.structuredPayload;

  const rewriteDiagnostics = diagnosticsFromIssueCodes(rewriteDecision.reasons);
  await args.emitTimeline({
    phase: "finalize",
    eventType: "editorial_rewrite_requested",
    title: "Editorial sharpener requested",
    detail: "Running a final anti-generic rewrite pass on the winning draft.",
    payload: {
      triggerReasons: rewriteDecision.reasons,
      diagnostics: rewriteDiagnostics,
      diagnosticSummary: summarizeDiagnostics(rewriteDiagnostics),
    },
  });

  const rewriteResult = await args.llm.callJson<GhostwriterAssistantPayload>({
    model: args.llmConfig.model,
    messages: [
      ...args.baseMessages,
      ...args.runtimeMessages,
      {
        role: "system",
        content: args.buildEditorialRewritePrompt({
          original: args.structuredPayload,
          claimPlan: args.structuredPayload.claimPlan,
          triggerReasons: rewriteDecision.reasons,
        }),
      },
    ],
    jsonSchema: args.chatResponseSchema,
    maxRetries: 1,
    retryDelayMs: 300,
    jobId: args.jobId,
    signal: args.signal,
  });

  if (!rewriteResult.success) {
    if (args.signal.aborted) throw requestTimeout("Chat generation was cancelled");
    throw upstreamError("Ghostwriter editorial rewrite failed", { reason: rewriteResult.error });
  }

  const rewrittenPayload = finalizePayloadCandidate({
    raw: rewriteResult.data,
    prompt: args.prompt,
    profile: args.context.profile,
    knowledgeBase: args.context.knowledgeBase,
    evidencePack: args.context.evidencePack as never,
    runtimeState: args.runtimeState as never,
    claimPlan: args.structuredPayload.claimPlan,
    evidenceSelection: args.evidenceSelection,
  });

  const nextPayload = {
    ...rewrittenPayload,
    claimPlan: rewrittenPayload.claimPlan ?? args.structuredPayload.claimPlan,
  };

  await args.emitTimeline({
    phase: "finalize",
    eventType: "editorial_rewrite_completed",
    title: "Editorial sharpener completed",
    detail: "Applied a final tightening pass to reduce generic phrasing and improve specificity.",
    payload: {
      triggerReasons: rewriteDecision.reasons,
      improvedFields: [nextPayload.coverLetterDraft ? "coverLetterDraft" : null, nextPayload.response ? "response" : null].filter(
        (value): value is string => Boolean(value),
      ),
    },
  });

  return nextPayload;
}

export async function runReviewerStage(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  jobId: string;
  signal: AbortSignal;
  emitTimeline: GhostwriterEmitTimeline;
  structuredPayload: GhostwriterAssistantPayload;
  evidenceSelection: GhostwriterEvidenceSelectionPlan;
  chatResponseSchema: JsonSchemaDefinition;
  reviewGhostwriterPayload: (args: {
    payload: GhostwriterAssistantPayload;
    claimPlan: GhostwriterClaimPlan | null | undefined;
    roleFamily?: string | null;
  }) => ReviewResult;
  buildReviewerRewritePrompt: (args: {
    payload: GhostwriterAssistantPayload;
    review: ReviewResult;
    claimPlan: GhostwriterClaimPlan | null | undefined;
  }) => string;
}): Promise<GhostwriterAssistantPayload> {
  let review = args.reviewGhostwriterPayload({
    payload: args.structuredPayload,
    claimPlan: args.structuredPayload.claimPlan,
    roleFamily: args.context.evidencePack.targetRoleFamily,
  });
  let structuredPayload = attachReviewToPayload(args.structuredPayload, review as never);
  await emitReviewCompleted(args.emitTimeline, review);

  if (!review.shouldRewrite) return structuredPayload;

  await args.emitTimeline({
    phase: "finalize",
    eventType: "review_rewrite_requested",
    title: "Reviewer requested another rewrite",
    detail: "The post-generation judge flagged the draft for one more quality pass.",
    payload: {
      issues: review.issues,
      diagnostics: normalizeDiagnostics(review.diagnostics),
      diagnosticSummary: summarizeDiagnostics(review.diagnostics),
    },
  });

  const reviewerRewriteResult = await args.llm.callJson<GhostwriterAssistantPayload>({
    model: args.llmConfig.model,
    messages: [
      ...args.baseMessages,
      ...args.runtimeMessages,
      {
        role: "system",
        content: args.buildReviewerRewritePrompt({
          payload: structuredPayload,
          review,
          claimPlan: structuredPayload.claimPlan,
        }),
      },
    ],
    jsonSchema: args.chatResponseSchema,
    maxRetries: 1,
    retryDelayMs: 300,
    jobId: args.jobId,
    signal: args.signal,
  });

  if (!reviewerRewriteResult.success) {
    if (args.signal.aborted) throw requestTimeout("Chat generation was cancelled");
    throw upstreamError("Ghostwriter reviewer rewrite failed", { reason: reviewerRewriteResult.error });
  }

  const rewrittenPayload = finalizePayloadCandidate({
    raw: reviewerRewriteResult.data,
    prompt: args.prompt,
    profile: args.context.profile,
    knowledgeBase: args.context.knowledgeBase,
    evidencePack: args.context.evidencePack as never,
    runtimeState: args.runtimeState as never,
    claimPlan: structuredPayload.claimPlan,
    evidenceSelection: args.evidenceSelection,
  });

  review = args.reviewGhostwriterPayload({
    payload: rewrittenPayload,
    claimPlan: structuredPayload.claimPlan,
    roleFamily: args.context.evidencePack.targetRoleFamily,
  });
  structuredPayload = attachReviewToPayload(rewrittenPayload, review as never);

  await args.emitTimeline({
    phase: "finalize",
    eventType: "editorial_rewrite_completed",
    title: "Reviewer rewrite completed",
    detail: review.summary,
    payload: {
      triggerReasons: structuredPayload.review?.issues ?? [],
      improvedFields: [
        structuredPayload.coverLetterDraft ? "coverLetterDraft" : null,
        structuredPayload.response ? "response" : null,
        structuredPayload.review ? "review" : null,
      ].filter((value): value is string => Boolean(value)),
    },
  });
  await emitReviewCompleted(args.emitTimeline, review);

  return structuredPayload;
}

export async function finalizeStructuredPayload(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  runtimeState: GhostwriterRuntimeState;
  baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  runtimeMessages: Array<{ role: "system"; content: string }>;
  prompt: string;
  jobId: string;
  signal: AbortSignal;
  emitTimeline: GhostwriterEmitTimeline;
  structuredPayload: GhostwriterAssistantPayload & { __variantName?: string };
  evidenceSelection: GhostwriterEvidenceSelectionPlan;
  chatResponseSchema: JsonSchemaDefinition;
  shouldRunEditorialRewrite: (payload: GhostwriterAssistantPayload) => { shouldRewrite: boolean; reasons: string[] };
  buildEditorialRewritePrompt: (args: {
    original: GhostwriterAssistantPayload;
    claimPlan: GhostwriterClaimPlan | null | undefined;
    triggerReasons: string[];
  }) => string;
  reviewGhostwriterPayload: (args: {
    payload: GhostwriterAssistantPayload;
    claimPlan: GhostwriterClaimPlan | null | undefined;
    roleFamily?: string | null;
  }) => ReviewResult;
  buildReviewerRewritePrompt: (args: {
    payload: GhostwriterAssistantPayload;
    review: ReviewResult;
    claimPlan: GhostwriterClaimPlan | null | undefined;
  }) => string;
}): Promise<GhostwriterAssistantPayload> {
  const editorialPayload = await runEditorialRewriteStage({
    ...args,
    shouldRunEditorialRewrite: args.shouldRunEditorialRewrite,
    buildEditorialRewritePrompt: args.buildEditorialRewritePrompt,
  });
  return runReviewerStage({
    ...args,
    structuredPayload: editorialPayload,
    reviewGhostwriterPayload: args.reviewGhostwriterPayload,
    buildReviewerRewritePrompt: args.buildReviewerRewritePrompt,
  });
}
