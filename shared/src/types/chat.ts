export const JOB_CHAT_MESSAGE_ROLES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const;
export type JobChatMessageRole = (typeof JOB_CHAT_MESSAGE_ROLES)[number];

export const JOB_CHAT_MESSAGE_STATUSES = [
  "complete",
  "partial",
  "cancelled",
  "failed",
] as const;
export type JobChatMessageStatus = (typeof JOB_CHAT_MESSAGE_STATUSES)[number];

export const JOB_CHAT_RUN_STATUSES = [
  "running",
  "completed",
  "cancelled",
  "failed",
] as const;
export type JobChatRunStatus = (typeof JOB_CHAT_RUN_STATUSES)[number];

export interface JobChatThread {
  id: string;
  jobId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  activeRootMessageId: string | null;
}

export interface JobChatMessage {
  id: string;
  threadId: string;
  jobId: string;
  role: JobChatMessageRole;
  content: string;
  status: JobChatMessageStatus;
  tokensIn: number | null;
  tokensOut: number | null;
  version: number;
  replacesMessageId: string | null;
  parentMessageId: string | null;
  activeChildId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GhostwriterSkillGroup {
  name: string;
  keywords: string[];
}

export interface GhostwriterResumePatch {
  tailoredSummary: string | null;
  tailoredHeadline: string | null;
  tailoredSkills: GhostwriterSkillGroup[] | null;
}

export type GhostwriterCoverLetterKind = "letter" | "email";

export interface GhostwriterRuntimePlanSummary {
  role: string;
  taskKind: string;
  deliverable: string;
  responseMode: "draft" | "brief" | "mixed" | "memory_update";
  executionNotes: string[];
  selectedTools: string[];
}

export interface GhostwriterToolTraceEntry {
  name: string;
  purpose: string;
  output: string;
}

export interface GhostwriterExecutionStage {
  stage: string;
  summary: string;
}

export interface GhostwriterFitBrief {
  strongestPoints: string[];
  risks: string[];
  recommendedAngle: string | null;
}

export interface GhostwriterClaimPlanItem {
  id: string;
  claim: string;
  jdRequirement: string | null;
  evidenceIds: string[];
  evidenceSnippets: string[];
  priority: "must" | "high" | "medium";
  riskLevel: "low" | "medium" | "high";
  guidance: string | null;
}

export interface GhostwriterClaimPlan {
  targetRoleAngle: string;
  openingStrategy: string;
  claims: GhostwriterClaimPlanItem[];
  excludedClaims: string[];
  reviewerFocus: string[];
}

export interface GhostwriterDiagnostic {
  code: string;
  category:
    | "generic-language"
    | "structure"
    | "claim-coverage"
    | "evidence-boundary"
    | "overclaim"
    | "role-fit"
    | "style"
    | "quality";
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface GhostwriterReviewSummary {
  summary: string;
  specificity: number;
  evidenceStrength: number;
  overclaimRisk: number;
  naturalness: number;
  issues: string[];
  diagnostics?: GhostwriterDiagnostic[];
}

export interface GhostwriterEvidenceSelectionSummary {
  leadModuleId: string | null;
  leadModuleLabel: string | null;
  allowedModuleIds: string[];
  allowedModuleLabels: string[];
  blockedClaims: string[];
  requiredEvidenceSnippets: string[];
  selectionRationale: string[];
}

export interface GhostwriterAssistantPayload {
  response: string;
  coverLetterDraft: string | null;
  coverLetterKind: GhostwriterCoverLetterKind | null;
  resumePatch: GhostwriterResumePatch | null;
  fitBrief?: GhostwriterFitBrief | null;
  claimPlan?: GhostwriterClaimPlan | null;
  evidenceSelection?: GhostwriterEvidenceSelectionSummary | null;
  review?: GhostwriterReviewSummary | null;
  runtimePlan?: GhostwriterRuntimePlanSummary | null;
  toolTrace?: GhostwriterToolTraceEntry[] | null;
  executionTrace?: GhostwriterExecutionStage[] | null;
}

export interface BranchInfo {
  /** The message ID this branch info belongs to (the currently active sibling). */
  messageId: string;
  /** Ordered sibling IDs at this branch point (by createdAt). */
  siblingIds: string[];
  /** 0-based index of the active sibling within siblingIds. */
  activeIndex: number;
}

export interface JobChatRun {
  id: string;
  threadId: string;
  jobId: string;
  status: JobChatRunStatus;
  model: string | null;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
}

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
    shouldRewrite: boolean;
  };
  review_rewrite_requested: {
    issues: string[];
    diagnostics?: GhostwriterDiagnostic[];
  };
  editorial_rewrite_requested: {
    triggerReasons: string[];
    diagnostics?: GhostwriterDiagnostic[];
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

export type ApplicationChatThread = JobChatThread;
export type ApplicationChatMessage = JobChatMessage;
export type ApplicationChatRun = JobChatRun;
export type ApplicationChatRunEvent = JobChatRunEvent;

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
