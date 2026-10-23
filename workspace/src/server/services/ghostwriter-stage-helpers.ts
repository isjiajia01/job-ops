import { upstreamError } from "@infra/errors";
import type {
  GhostwriterAssistantPayload,
  GhostwriterClaimPlan,
  GhostwriterFitBrief,
  JobChatRun,
  JobChatRunEvent,
  JobChatRunEventPayloadByType,
  JobChatRunEventType,
  JobChatRunPhase,
} from "@shared/types";
import { normalizeGhostwriterAssistantPayload } from "@shared/utils/ghostwriter";
import type * as ghostwriterRepo from "../repositories/ghostwriter";
import type { buildJobChatPromptContext } from "./ghostwriter-context";
import type { GhostwriterEvidenceSelectionPlan } from "./ghostwriter-evidence-selector";
import { summarizeEvidenceSelectionPlan } from "./ghostwriter-evidence-selector";
import type { buildGhostwriterRuntimeState } from "./ghostwriter-runtime";
import { lintCoverLetterDraft, sanitizeResumePatch } from "./ghostwriter-output-guard";
import { reviewGhostwriterPayload } from "./ghostwriter-reviewer";
import { summarizeDiagnostics } from "./ghostwriter-diagnostics";

type GhostwriterRunContext = Awaited<ReturnType<typeof buildJobChatPromptContext>>;
type GhostwriterRuntimeState = ReturnType<typeof buildGhostwriterRuntimeState>;

export type GhostwriterEmitTimeline = <TType extends JobChatRunEventType>(input: {
  phase: JobChatRunPhase;
  eventType: TType;
  title: string;
  detail?: string | null;
  payload: JobChatRunEventPayloadByType[TType];
}) => Promise<JobChatRunEvent>;

export async function emitRunTimelineEvent<TType extends JobChatRunEventType>(args: {
  createRunEvent: typeof ghostwriterRepo.createRunEvent;
  onTimeline?: (payload: { runId: string; event: JobChatRunEvent }) => void;
  run: JobChatRun;
  input: {
    phase: JobChatRunPhase;
    eventType: TType;
    title: string;
    detail?: string | null;
    payload: JobChatRunEventPayloadByType[TType];
  };
}): Promise<JobChatRunEvent> {
  const event = await args.createRunEvent({
    runId: args.run.id,
    threadId: args.run.threadId,
    jobId: args.run.jobId,
    phase: args.input.phase,
    eventType: args.input.eventType,
    title: args.input.title,
    detail: args.input.detail ?? null,
    payload: args.input.payload ?? null,
  });
  args.onTimeline?.({ runId: args.run.id, event });
  return event;
}

export function buildBaseLlmMessages(args: {
  systemPrompt: string;
  jobSnapshot: string;
  profileSnapshot: string;
  companyResearchSnapshot: string;
  evidencePackSnapshot: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  return [
    { role: "system" as const, content: args.systemPrompt },
    { role: "system" as const, content: `Job Context (JSON):\n${args.jobSnapshot}` },
    {
      role: "system" as const,
      content: `Profile Context:\n${args.profileSnapshot || "No profile context available."}`,
    },
    ...(args.companyResearchSnapshot
      ? [{ role: "system" as const, content: `Company Research Context:\n${args.companyResearchSnapshot}` }]
      : []),
    { role: "system" as const, content: `Evidence Pack:\n${args.evidencePackSnapshot}` },
    ...args.history,
  ];
}

function isPartialCoverLetterRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const asksCoverLetter = /cover[ -]?letter|motivation letter|application letter/.test(normalized);
  const asksPartial = /opening|intro|introduction|hook|paragraph|2-sentence|two-sentence|sentence|closing line|closing paragraph/.test(normalized);
  return asksCoverLetter && asksPartial;
}

function stripLeadingSalutationBlock(text: string): string {
  return text.trim().replace(/^Dear[^\n]*\n\n/i, "").trim();
}

function isDirectBulletRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\bbullets?\b/.test(normalized) && /just give the wording|just the wording|resume/.test(normalized);
}

function countBulletLines(text: string): number {
  return text.split("\n").filter((line) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(line)).length;
}

function normalizeBulletSentence(text: string): string {
  return text.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim().replace(/[.;:,\s]+$/, "");
}

function buildFallbackBulletResponse(evidencePack: GhostwriterRunContext["evidencePack"]): string | null {
  const lead = evidencePack.experienceBank[0];
  const support = evidencePack.experienceBank[1];
  if (!lead) return null;
  const candidateLines = [
    ...lead.strongestClaims,
    ...(support?.strongestClaims ?? []),
    ...lead.supportSignals,
    ...(support?.supportSignals ?? []),
  ]
    .map(normalizeBulletSentence)
    .filter((line) => line.length >= 28 && !/@/.test(line));
  const uniqueLines: string[] = [];
  for (const line of candidateLines) {
    if (uniqueLines.some((existing) => existing.toLowerCase() === line.toLowerCase())) continue;
    uniqueLines.push(line);
    if (uniqueLines.length === 3) break;
  }
  if (uniqueLines.length < 2) return null;
  if (uniqueLines.length < 3) uniqueLines.push("Turned structured analysis into stakeholder-ready, decision-useful outputs.");
  return uniqueLines.slice(0, 3).map((line) => `• ${line}.`).join("\n");
}

function sharpenBulletListResponse(text: string): string {
  const lines = text.split("\n");
  const bulletIndexes = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^\s*[-•*]/.test(line));
  if (bulletIndexes.length < 3) return text;
  const lower = text.toLowerCase();
  const last = bulletIndexes[bulletIndexes.length - 1];
  const genericSupportPattern = /supported (day-to-day )?(business analysis|business follow-up|practical business analysis tasks|ongoing business follow-up)/i;
  if (!genericSupportPattern.test(last.line)) return text;
  let replacement = last.line;
  if (/python|excel|reporting|decision-ready|stakeholder/.test(lower)) {
    replacement = `${last.line.charAt(0)} Built a reliable bridge from recurring reporting and operational analysis to stakeholder-ready materials, documentation, and practical follow-up.`;
  }
  const next = [...lines];
  next[last.index] = replacement;
  return next.join("\n");
}

function buildFitBrief(evidencePack?: GhostwriterRunContext["evidencePack"]): GhostwriterFitBrief | null {
  if (!evidencePack) return null;
  const strongestPoints = [...evidencePack.topFitReasons, ...evidencePack.topEvidence].slice(0, 4);
  const risks = [...evidencePack.biggestGaps, ...evidencePack.forbiddenClaims].slice(0, 4);
  if (!strongestPoints.length && !risks.length && !evidencePack.recommendedAngle) return null;
  return { strongestPoints, risks, recommendedAngle: evidencePack.recommendedAngle || null };
}

export function finalizePayloadCandidate(args: {
  raw: unknown;
  prompt?: string;
  profile: GhostwriterRunContext["profile"];
  knowledgeBase: GhostwriterRunContext["knowledgeBase"];
  evidencePack?: GhostwriterRunContext["evidencePack"];
  runtimeState?: GhostwriterRuntimeState;
  claimPlan?: GhostwriterClaimPlan | null;
  evidenceSelection?: GhostwriterEvidenceSelectionPlan | null;
}): GhostwriterAssistantPayload {
  const payload = normalizeGhostwriterAssistantPayload(args.raw);
  if (!payload) throw upstreamError("LLM returned an invalid Ghostwriter payload");
  const { sanitized: sanitizedCoverLetterDraft } = lintCoverLetterDraft(payload.coverLetterDraft);
  const sanitizedResumePatch = payload.resumePatch
    ? sanitizeResumePatch({ patch: payload.resumePatch, profile: args.profile, knowledgeBase: args.knowledgeBase }).sanitized
    : null;
  const fallbackBulletResponse = args.prompt && isDirectBulletRequest(args.prompt) && countBulletLines(payload.response) < 3 && args.evidencePack
    ? buildFallbackBulletResponse(args.evidencePack)
    : null;
  const summarizedEvidenceSelection = args.evidenceSelection
    ? summarizeEvidenceSelectionPlan(args.evidenceSelection)
    : (payload.evidenceSelection ?? null);

  if (sanitizedCoverLetterDraft && args.prompt && isPartialCoverLetterRequest(args.prompt)) {
    return {
      ...payload,
      response: stripLeadingSalutationBlock(sanitizedCoverLetterDraft),
      coverLetterDraft: null,
      coverLetterKind: null,
      resumePatch: sanitizedResumePatch,
      fitBrief: payload.fitBrief ?? buildFitBrief(args.evidencePack),
      claimPlan: args.claimPlan ?? payload.claimPlan ?? null,
      evidenceSelection: summarizedEvidenceSelection,
      review: payload.review ?? null,
      runtimePlan: args.runtimeState?.plan ?? payload.runtimePlan ?? null,
      toolTrace: args.runtimeState?.toolResults ?? payload.toolTrace ?? null,
      executionTrace: args.runtimeState?.executionTrace ?? payload.executionTrace ?? null,
    };
  }

  const baseResponse = fallbackBulletResponse ?? payload.response;
  const sharpenedResponse = payload.coverLetterDraft ? baseResponse : sharpenBulletListResponse(baseResponse);
  return {
    ...payload,
    response: sharpenedResponse,
    coverLetterDraft: sanitizedCoverLetterDraft,
    resumePatch: sanitizedResumePatch,
    fitBrief: payload.fitBrief ?? buildFitBrief(args.evidencePack),
    claimPlan: args.claimPlan ?? payload.claimPlan ?? null,
    evidenceSelection: summarizedEvidenceSelection,
    review: payload.review ?? null,
    runtimePlan: args.runtimeState?.plan ?? payload.runtimePlan ?? null,
    toolTrace: args.runtimeState?.toolResults ?? payload.toolTrace ?? null,
    executionTrace: args.runtimeState?.executionTrace ?? payload.executionTrace ?? null,
  };
}

export function attachReviewToPayload(
  payload: GhostwriterAssistantPayload,
  review: ReturnType<typeof reviewGhostwriterPayload>,
): GhostwriterAssistantPayload {
  return {
    ...payload,
    review: {
      summary: review.summary,
      specificity: review.scores.specificity,
      evidenceStrength: review.scores.evidenceStrength,
      overclaimRisk: review.scores.overclaimRisk,
      naturalness: review.scores.naturalness,
      issues: review.issues,
      diagnostics: review.diagnostics,
      diagnosticSummary: summarizeDiagnostics(review.diagnostics),
    },
  };
}
