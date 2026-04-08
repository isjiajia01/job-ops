import type { GhostwriterDiagnostic, GhostwriterDiagnosticSummaryItem } from "./diagnostics";
import type {
  GhostwriterCoverLetterKind,
  GhostwriterRuntimePlanSummary,
} from "./payload";
import type { JobChatMessage } from "./messages";

export type JobChatRunPhase =
  | "run"
  | "context"
  | "runtime"
  | "memory"
  | "strategy"
  | "generation"
  | "finalize"
  | "terminal";

export type JobChatRunEventPayloadByType = {
  cancelled: {};
  completed: { outputChars?: number };
  claim_plan_built: {
    targetRoleAngle: string;
    openingStrategy: string;
    claimCount: number;
    mustClaimCount: number;
    excludedClaims?: string[];
  };
  context_built: {
    historyMessages: number;
    employer?: string;
    title?: string;
    topFitReasons?: string[];
    topEvidence?: string[];
  };
  direct_reply: {
    prompt: string;
    responseMode: GhostwriterRuntimePlanSummary["responseMode"];
  };
  memory_update: {
    prompt: string;
  };
  runtime_planned: {
    taskKind: string;
    responseMode: GhostwriterRuntimePlanSummary["responseMode"];
    selectedTools: string[];
  };
  editorial_rewrite_completed: {
    triggerReasons: string[];
    improvedFields: string[];
  };
  review_completed: {
    summary: string;
    specificity: number;
    evidenceStrength: number;
    overclaimRisk: number;
    naturalness: number;
    issues: string[];
    diagnostics?: GhostwriterDiagnostic[];
    diagnosticSummary?: GhostwriterDiagnosticSummaryItem[];
    shouldRewrite: boolean;
  };
  review_rewrite_requested: {
    issues: string[];
    diagnostics?: GhostwriterDiagnostic[];
    diagnosticSummary?: GhostwriterDiagnosticSummaryItem[];
  };
  editorial_rewrite_requested: {
    triggerReasons: string[];
    diagnostics?: GhostwriterDiagnostic[];
    diagnosticSummary?: GhostwriterDiagnosticSummaryItem[];
  };
  selection: {
    hasCoverLetterDraft: boolean;
    coverLetterKind: GhostwriterCoverLetterKind | null;
    hasResumePatch: boolean;
    fitBriefStrongPoints: string[];
    selectedOutputMode: "cover_letter" | "application_email" | "resume_patch" | "direct_response";
    winnerReason: string;
    candidateCount?: number;
    winningVariant?: string;
    strongestEvidence?: string[];
    coveredClaimIds?: string[];
  };
  status: {
    requestId: string;
    assistantMessageId: string;
    model: string | null;
    provider: string | null;
  };
  strategy_built: {
    strongestEvidence: string[];
    weakPoints: string[];
    paragraphPlan: string[];
  };
  strategy_requested: {
    prompt: string;
    taskKind: string;
  };
  variant_completed: {
    variant: string;
    hasCoverLetterDraft: boolean;
    hasResumePatch: boolean;
    responsePreview: string;
  };
  variant_scored: {
    variant: string;
    finalScore: number;
    coveredClaimIds: string[];
    mustClaimCoverage: number;
    evidenceCoverage: number;
    penalties: string[];
    diagnostics?: GhostwriterDiagnostic[];
    diagnosticSummary?: GhostwriterDiagnosticSummaryItem[];
  };
  variant_requested: {
    variant: string;
    coverLetterKind: GhostwriterCoverLetterKind | null;
  };
  failed: { code?: string };
};

export type JobChatRunEventType = keyof JobChatRunEventPayloadByType;

export interface JobChatRunEventBase {
  id: string;
  runId: string;
  threadId: string;
  jobId: string;
  sequence: number;
  phase: JobChatRunPhase;
  title: string;
  detail: string | null;
  createdAt: number;
}

export type JobChatRunEvent = {
  [K in JobChatRunEventType]: JobChatRunEventBase & {
    eventType: K;
    payload: JobChatRunEventPayloadByType[K];
  };
}[JobChatRunEventType];

export type JobChatStreamEvent =
  | {
      type: "ready";
      runId: string;
      threadId: string;
      messageId: string;
      requestId: string;
    }
  | {
      type: "delta";
      runId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: "timeline";
      runId: string;
      event: JobChatRunEvent;
    }
  | {
      type: "completed";
      runId: string;
      message: JobChatMessage;
    }
  | {
      type: "cancelled";
      runId: string;
      message: JobChatMessage;
    }
  | {
      type: "error";
      runId: string;
      code: string;
      message: string;
      requestId: string;
    };
