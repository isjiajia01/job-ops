import type {
  GhostwriterDiagnostic,
  GhostwriterDiagnosticSummaryItem,
} from "./diagnostics";

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

export interface GhostwriterReviewSummary {
  summary: string;
  specificity: number;
  evidenceStrength: number;
  overclaimRisk: number;
  naturalness: number;
  issues: string[];
  diagnostics?: GhostwriterDiagnostic[];
  diagnosticSummary?: GhostwriterDiagnosticSummaryItem[];
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
