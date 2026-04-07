import { z } from "zod";
import type {
  GhostwriterAssistantPayload,
  GhostwriterClaimPlan,
  GhostwriterExecutionStage,
  GhostwriterDiagnostic,
  GhostwriterEvidenceSelectionSummary,
  GhostwriterFitBrief,
  GhostwriterResumePatch,
  GhostwriterReviewSummary,
  GhostwriterRuntimePlanSummary,
  GhostwriterSkillGroup,
  GhostwriterToolTraceEntry,
} from "../types";

const ghostwriterSkillGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  keywords: z.array(z.string().trim().min(1).max(80)).max(12),
});

const ghostwriterResumePatchSchema = z.object({
  tailoredSummary: z.string().trim().max(2400).nullable().optional(),
  tailoredHeadline: z.string().trim().max(240).nullable().optional(),
  tailoredSkills: z
    .array(ghostwriterSkillGroupSchema)
    .max(10)
    .nullable()
    .optional(),
});

export const candidateKnowledgeFactSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(2000),
});

export const candidateKnowledgeProjectSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2400),
  keywords: z.array(z.string().trim().min(1).max(80)).max(12),
  role: z.string().trim().max(200).nullable().default(null),
  impact: z.string().trim().max(1200).nullable().default(null),
  roleRelevance: z.string().trim().max(1200).nullable().default(null),
  cvBullets: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
});

export const companyResearchNoteSchema = z.object({
  company: z.string().trim().min(1).max(200),
  source: z.string().trim().max(2000).nullable().default(null),
  summary: z.string().trim().min(1).max(2400),
});

export const ghostwriterWritingPreferenceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  instruction: z.string().trim().min(1).max(2000),
  kind: z
    .enum(["tone", "positioning", "guardrail", "phrase", "priority"])
    .default("positioning"),
  strength: z.enum(["normal", "strong"]).default("normal"),
});

export const candidateKnowledgeInboxSuggestedFactSchema = z.object({
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(2000),
});

export const candidateKnowledgeInboxSuggestedProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2400),
  keywords: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  role: z.string().trim().max(200).nullable().default(null),
  impact: z.string().trim().max(1200).nullable().default(null),
  roleRelevance: z.string().trim().max(1200).nullable().default(null),
});

export const candidateKnowledgeInboxSuggestedPreferenceSchema = z.object({
  label: z.string().trim().min(1).max(160),
  instruction: z.string().trim().min(1).max(2000),
  kind: z
    .enum(["tone", "positioning", "guardrail", "phrase", "priority"])
    .default("positioning"),
  strength: z.enum(["normal", "strong"]).default("normal"),
});

export const candidateKnowledgeInboxItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  createdAt: z.string().trim().min(1).max(80),
  updatedAt: z.string().trim().min(1).max(80),
  kind: z.enum(["project", "fact", "preference", "general"]),
  status: z.enum(["pending", "accepted", "archived"]),
  sourceLabel: z.string().trim().max(200).nullable().default(null),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2000),
  rawText: z.string().trim().min(1).max(12000),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  suggestedFact: candidateKnowledgeInboxSuggestedFactSchema
    .nullable()
    .default(null),
  suggestedProject: candidateKnowledgeInboxSuggestedProjectSchema
    .nullable()
    .default(null),
  suggestedPreference: candidateKnowledgeInboxSuggestedPreferenceSchema
    .nullable()
    .default(null),
});

export const candidateKnowledgeBaseSchema = z.object({
  personalFacts: z.array(candidateKnowledgeFactSchema).max(200),
  projects: z.array(candidateKnowledgeProjectSchema).max(200),
  companyResearchNotes: z.array(companyResearchNoteSchema).max(200).default([]),
  writingPreferences: z
    .array(ghostwriterWritingPreferenceSchema)
    .max(200)
    .default([]),
  inboxItems: z.array(candidateKnowledgeInboxItemSchema).max(400).default([]),
});

const ghostwriterFitBriefSchema = z.object({
  strongestPoints: z.array(z.string().trim().min(1).max(400)).max(8),
  risks: z.array(z.string().trim().min(1).max(400)).max(8),
  recommendedAngle: z.string().trim().max(500).nullable().optional(),
});

const ghostwriterDiagnosticSchema = z.object({
  code: z.string().trim().min(1).max(120),
  category: z.enum([
    "generic-language",
    "structure",
    "claim-coverage",
    "evidence-boundary",
    "overclaim",
    "role-fit",
    "style",
    "quality",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  detail: z.string().trim().min(1).max(300),
});

const ghostwriterReviewSummarySchema = z.object({
  summary: z.string().trim().min(1).max(600),
  specificity: z.number().min(1).max(5),
  evidenceStrength: z.number().min(1).max(5),
  overclaimRisk: z.number().min(1).max(5),
  naturalness: z.number().min(1).max(5),
  issues: z.array(z.string().trim().min(1).max(200)).max(12),
  diagnostics: z.array(ghostwriterDiagnosticSchema).max(16).optional(),
});

const ghostwriterEvidenceSelectionSummarySchema = z.object({
  leadModuleId: z.string().trim().max(120).nullable().optional(),
  leadModuleLabel: z.string().trim().max(240).nullable().optional(),
  allowedModuleIds: z.array(z.string().trim().min(1).max(120)).max(8),
  allowedModuleLabels: z.array(z.string().trim().min(1).max(240)).max(8),
  blockedClaims: z.array(z.string().trim().min(1).max(600)).max(10),
  requiredEvidenceSnippets: z.array(z.string().trim().min(1).max(600)).max(10),
  selectionRationale: z.array(z.string().trim().min(1).max(600)).max(8),
});

const ghostwriterRuntimePlanSummarySchema = z.object({
  role: z.string().trim().min(1).max(200),
  taskKind: z.string().trim().min(1).max(80),
  deliverable: z.string().trim().min(1).max(1000),
  responseMode: z.enum(["draft", "brief", "mixed", "memory_update"]),
  executionNotes: z.array(z.string().trim().min(1).max(400)).max(12),
  selectedTools: z.array(z.string().trim().min(1).max(120)).max(12),
});

const ghostwriterClaimPlanItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  claim: z.string().trim().min(1).max(600),
  jdRequirement: z.string().trim().max(600).nullable().optional(),
  evidenceIds: z.array(z.string().trim().min(1).max(120)).max(8),
  evidenceSnippets: z.array(z.string().trim().min(1).max(600)).max(8),
  priority: z.enum(["must", "high", "medium"]),
  riskLevel: z.enum(["low", "medium", "high"]),
  guidance: z.string().trim().max(600).nullable().optional(),
});

const ghostwriterClaimPlanSchema = z.object({
  targetRoleAngle: z.string().trim().min(1).max(600),
  openingStrategy: z.string().trim().min(1).max(600),
  claims: z.array(ghostwriterClaimPlanItemSchema).max(8),
  excludedClaims: z.array(z.string().trim().min(1).max(600)).max(8),
  reviewerFocus: z.array(z.string().trim().min(1).max(600)).max(8),
});

const ghostwriterToolTraceEntrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(240),
  output: z.string().trim().min(1).max(2400),
});

const ghostwriterExecutionStageSchema = z.object({
  stage: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
});

export const ghostwriterAssistantPayloadSchema = z.object({
  response: z.string(),
  coverLetterDraft: z.string().trim().max(12000).nullable().optional(),
  coverLetterKind: z.enum(["letter", "email"]).nullable().optional(),
  resumePatch: ghostwriterResumePatchSchema.nullable().optional(),
  fitBrief: ghostwriterFitBriefSchema.nullable().optional(),
  claimPlan: ghostwriterClaimPlanSchema.nullable().optional(),
  evidenceSelection: ghostwriterEvidenceSelectionSummarySchema.nullable().optional(),
  review: ghostwriterReviewSummarySchema.nullable().optional(),
  runtimePlan: ghostwriterRuntimePlanSummarySchema.nullable().optional(),
  toolTrace: z.array(ghostwriterToolTraceEntrySchema).max(12).nullable().optional(),
  executionTrace: z.array(ghostwriterExecutionStageSchema).max(12).nullable().optional(),
});

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLooseSkillGroup(
  value: unknown,
): GhostwriterSkillGroup | null {
  if (!value) return null;

  if (typeof value === "string") {
    const name = value.trim();
    if (!name) return null;
    return { name, keywords: [] };
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const name =
    toNonEmptyString(record.name) ??
    toNonEmptyString(record.label) ??
    toNonEmptyString(record.group);
  if (!name) return null;

  const rawKeywords = Array.isArray(record.keywords)
    ? record.keywords
    : Array.isArray(record.items)
      ? record.items
      : [];

  const keywords = rawKeywords
    .map((item) => toNonEmptyString(item))
    .filter((item): item is string => Boolean(item));

  return { name, keywords };
}

function normalizeLooseResumePatch(
  value: unknown,
): GhostwriterResumePatch | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const skillsSource = Array.isArray(record.tailoredSkills)
    ? record.tailoredSkills
    : Array.isArray(record.skills)
      ? record.skills
      : null;

  return normalizeResumePatch({
    tailoredSummary:
      toNonEmptyString(record.tailoredSummary) ??
      toNonEmptyString(record.summary) ??
      undefined,
    tailoredHeadline:
      toNonEmptyString(record.tailoredHeadline) ??
      toNonEmptyString(record.headline) ??
      undefined,
    tailoredSkills: skillsSource
      ? skillsSource
          .map((item) => normalizeLooseSkillGroup(item))
          .filter((item): item is GhostwriterSkillGroup => Boolean(item))
      : undefined,
  });
}

function normalizeSkills(
  skills: GhostwriterSkillGroup[] | null | undefined,
): GhostwriterSkillGroup[] | null {
  if (!skills || skills.length === 0) return null;
  return skills.map((skill) => ({
    name: skill.name.trim(),
    keywords: skill.keywords.map((keyword) => keyword.trim()).filter(Boolean),
  }));
}

function normalizeResumePatch(
  patch: Partial<GhostwriterResumePatch> | null | undefined,
): GhostwriterResumePatch | null {
  if (!patch) return null;

  const normalized: GhostwriterResumePatch = {
    tailoredSummary:
      typeof patch.tailoredSummary === "string" && patch.tailoredSummary.trim()
        ? patch.tailoredSummary.trim()
        : null,
    tailoredHeadline:
      typeof patch.tailoredHeadline === "string" &&
      patch.tailoredHeadline.trim()
        ? patch.tailoredHeadline.trim()
        : null,
    tailoredSkills: normalizeSkills(patch.tailoredSkills),
  };

  if (
    !normalized.tailoredSummary &&
    !normalized.tailoredHeadline &&
    !normalized.tailoredSkills
  ) {
    return null;
  }

  return normalized;
}

function normalizeFitBrief(value: unknown): GhostwriterFitBrief | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const strongestPoints = Array.isArray(record.strongestPoints)
    ? record.strongestPoints.map((item) => toNonEmptyString(item)).filter((item): item is string => Boolean(item))
    : [];
  const risks = Array.isArray(record.risks)
    ? record.risks.map((item) => toNonEmptyString(item)).filter((item): item is string => Boolean(item))
    : [];
  const recommendedAngle = toNonEmptyString(record.recommendedAngle);
  if (!strongestPoints.length && !risks.length && !recommendedAngle) return null;
  return { strongestPoints, risks, recommendedAngle };
}

function normalizeClaimPlan(value: unknown): GhostwriterClaimPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const targetRoleAngle = toNonEmptyString(record.targetRoleAngle);
  const openingStrategy = toNonEmptyString(record.openingStrategy);
  const claims = Array.isArray(record.claims)
    ? record.claims
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const claimRecord = item as Record<string, unknown>;
          const id = toNonEmptyString(claimRecord.id);
          const claim = toNonEmptyString(claimRecord.claim);
          const priority = toNonEmptyString(claimRecord.priority);
          const riskLevel = toNonEmptyString(claimRecord.riskLevel);
          if (!id || !claim) return null;
          if (priority !== "must" && priority !== "high" && priority !== "medium") return null;
          if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") return null;
          const evidenceIds = Array.isArray(claimRecord.evidenceIds)
            ? claimRecord.evidenceIds.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
            : [];
          const evidenceSnippets = Array.isArray(claimRecord.evidenceSnippets)
            ? claimRecord.evidenceSnippets.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
            : [];
          return {
            id,
            claim,
            jdRequirement: toNonEmptyString(claimRecord.jdRequirement),
            evidenceIds,
            evidenceSnippets,
            priority,
            riskLevel,
            guidance: toNonEmptyString(claimRecord.guidance),
          };
        })
        .filter((item): item is GhostwriterClaimPlan["claims"][number] => Boolean(item))
    : [];
  const excludedClaims = Array.isArray(record.excludedClaims)
    ? record.excludedClaims.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const reviewerFocus = Array.isArray(record.reviewerFocus)
    ? record.reviewerFocus.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  if (!targetRoleAngle || !openingStrategy || claims.length === 0) return null;
  return { targetRoleAngle, openingStrategy, claims, excludedClaims, reviewerFocus };
}

function normalizeDiagnostics(value: unknown): GhostwriterDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const code = toNonEmptyString(record.code);
      const category = toNonEmptyString(record.category);
      const severity = toNonEmptyString(record.severity);
      const detail = toNonEmptyString(record.detail);
      if (!code || !detail) return null;
      if (
        category !== "generic-language" &&
        category !== "structure" &&
        category !== "claim-coverage" &&
        category !== "evidence-boundary" &&
        category !== "overclaim" &&
        category !== "role-fit" &&
        category !== "style" &&
        category !== "quality"
      ) {
        return null;
      }
      if (severity !== "low" && severity !== "medium" && severity !== "high") {
        return null;
      }
      return { code, category, severity, detail };
    })
    .filter((item): item is GhostwriterDiagnostic => Boolean(item));
}

function normalizeReview(value: unknown): GhostwriterReviewSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const summary = toNonEmptyString(record.summary);
  const specificity = typeof record.specificity === "number" ? record.specificity : null;
  const evidenceStrength = typeof record.evidenceStrength === "number" ? record.evidenceStrength : null;
  const overclaimRisk = typeof record.overclaimRisk === "number" ? record.overclaimRisk : null;
  const naturalness = typeof record.naturalness === "number" ? record.naturalness : null;
  const issues = Array.isArray(record.issues)
    ? record.issues.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  if (!summary || specificity == null || evidenceStrength == null || overclaimRisk == null || naturalness == null) return null;
  const diagnostics = normalizeDiagnostics(record.diagnostics);
  return { summary, specificity, evidenceStrength, overclaimRisk, naturalness, issues, diagnostics };
}

function normalizeEvidenceSelection(value: unknown): GhostwriterEvidenceSelectionSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const leadModuleId = toNonEmptyString(record.leadModuleId);
  const leadModuleLabel = toNonEmptyString(record.leadModuleLabel);
  const allowedModuleIds = Array.isArray(record.allowedModuleIds)
    ? record.allowedModuleIds.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const allowedModuleLabels = Array.isArray(record.allowedModuleLabels)
    ? record.allowedModuleLabels.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const blockedClaims = Array.isArray(record.blockedClaims)
    ? record.blockedClaims.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const requiredEvidenceSnippets = Array.isArray(record.requiredEvidenceSnippets)
    ? record.requiredEvidenceSnippets.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const selectionRationale = Array.isArray(record.selectionRationale)
    ? record.selectionRationale.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  if (!leadModuleId && !allowedModuleIds.length && !blockedClaims.length && !requiredEvidenceSnippets.length) return null;
  return { leadModuleId, leadModuleLabel, allowedModuleIds, allowedModuleLabels, blockedClaims, requiredEvidenceSnippets, selectionRationale };
}

function normalizeRuntimePlan(value: unknown): GhostwriterRuntimePlanSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role = toNonEmptyString(record.role);
  const taskKind = toNonEmptyString(record.taskKind);
  const deliverable = toNonEmptyString(record.deliverable);
  const responseMode = toNonEmptyString(record.responseMode);
  const executionNotes = Array.isArray(record.executionNotes)
    ? record.executionNotes.map((item) => toNonEmptyString(item)).filter((item): item is string => Boolean(item))
    : [];
  const selectedTools = Array.isArray(record.selectedTools)
    ? record.selectedTools.map((item) => toNonEmptyString(item)).filter((item): item is string => Boolean(item))
    : [];
  if (!role || !taskKind || !deliverable) return null;
  if (responseMode !== "draft" && responseMode !== "brief" && responseMode !== "mixed" && responseMode !== "memory_update") {
    return null;
  }
  return { role, taskKind, deliverable, responseMode, executionNotes, selectedTools };
}

function normalizeToolTrace(value: unknown): GhostwriterToolTraceEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = toNonEmptyString(record.name);
      const purpose = toNonEmptyString(record.purpose);
      const output = toNonEmptyString(record.output);
      if (!name || !purpose || !output) return null;
      return { name, purpose, output };
    })
    .filter((item): item is GhostwriterToolTraceEntry => Boolean(item));
  return entries.length ? entries : null;
}

function normalizeExecutionTrace(value: unknown): GhostwriterExecutionStage[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const stage = toNonEmptyString(record.stage);
      const summary = toNonEmptyString(record.summary);
      if (!stage || !summary) return null;
      return { stage, summary };
    })
    .filter((item): item is GhostwriterExecutionStage => Boolean(item));
  return entries.length ? entries : null;
}

export function normalizeGhostwriterAssistantPayload(
  input: unknown,
): GhostwriterAssistantPayload | null {
  const parsed = ghostwriterAssistantPayloadSchema.safeParse(input);
  if (parsed.success) {
    return {
      response: parsed.data.response ?? "",
      coverLetterDraft:
        typeof parsed.data.coverLetterDraft === "string" &&
        parsed.data.coverLetterDraft.trim()
          ? parsed.data.coverLetterDraft.trim()
          : null,
      coverLetterKind: parsed.data.coverLetterKind ?? null,
      resumePatch: normalizeResumePatch(parsed.data.resumePatch),
      fitBrief: normalizeFitBrief(parsed.data.fitBrief),
      claimPlan: normalizeClaimPlan(parsed.data.claimPlan),
      evidenceSelection: normalizeEvidenceSelection(parsed.data.evidenceSelection),
      review: normalizeReview(parsed.data.review),
      runtimePlan: normalizeRuntimePlan(parsed.data.runtimePlan),
      toolTrace: normalizeToolTrace(parsed.data.toolTrace),
      executionTrace: normalizeExecutionTrace(parsed.data.executionTrace),
    };
  }

  if (typeof input === "string") {
    const response = toNonEmptyString(input);
    return response
      ? {
          response,
          coverLetterDraft: null,
          coverLetterKind: null,
          resumePatch: null,
          fitBrief: null,
          claimPlan: null,
          evidenceSelection: null,
          review: null,
          runtimePlan: null,
          toolTrace: null,
          executionTrace: null,
        }
      : null;
  }

  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const response =
    toNonEmptyString(record.response) ??
    toNonEmptyString(record.content) ??
    toNonEmptyString(record.answer) ??
    toNonEmptyString(record.message) ??
    toNonEmptyString(record.text);

  if (!response) return null;

  const coverLetterDraft =
    toNonEmptyString(record.coverLetterDraft) ??
    toNonEmptyString(record.coverLetter) ??
    toNonEmptyString(record.letterDraft) ??
    toNonEmptyString(record.draft);

  const coverLetterKindRaw = toNonEmptyString(record.coverLetterKind);
  const coverLetterKind =
    coverLetterKindRaw === "letter" || coverLetterKindRaw === "email"
      ? coverLetterKindRaw
      : null;

  return {
    response,
    coverLetterDraft,
    coverLetterKind,
    resumePatch:
      normalizeLooseResumePatch(record.resumePatch) ??
      normalizeLooseResumePatch(record),
    fitBrief: normalizeFitBrief(record.fitBrief),
    claimPlan: normalizeClaimPlan(record.claimPlan),
    evidenceSelection: normalizeEvidenceSelection(record.evidenceSelection),
    review: normalizeReview(record.review),
    runtimePlan: normalizeRuntimePlan(record.runtimePlan),
    toolTrace: normalizeToolTrace(record.toolTrace),
    executionTrace: normalizeExecutionTrace(record.executionTrace),
  };
}

export function serializeGhostwriterAssistantPayload(
  payload: GhostwriterAssistantPayload,
): string {
  return JSON.stringify({
    response: payload.response,
    coverLetterDraft: payload.coverLetterDraft,
    coverLetterKind: payload.coverLetterKind,
    resumePatch: payload.resumePatch,
    fitBrief: payload.fitBrief ?? null,
    claimPlan: payload.claimPlan ?? null,
    evidenceSelection: payload.evidenceSelection ?? null,
    review: payload.review ?? null,
    runtimePlan: payload.runtimePlan ?? null,
    toolTrace: payload.toolTrace ?? null,
    executionTrace: payload.executionTrace ?? null,
  });
}

export function parseGhostwriterAssistantContent(
  content: string | null | undefined,
): GhostwriterAssistantPayload & { isStructured: boolean } {
  const raw = typeof content === "string" ? content : "";
  if (!raw.trim()) {
    return {
      response: "",
      coverLetterDraft: null,
      coverLetterKind: null,
      resumePatch: null,
      fitBrief: null,
      claimPlan: null,
      evidenceSelection: null,
      review: null,
      runtimePlan: null,
      toolTrace: null,
      executionTrace: null,
      isStructured: false,
    };
  }

  try {
    const parsed = normalizeGhostwriterAssistantPayload(JSON.parse(raw));
    if (parsed) {
      return {
        ...parsed,
        isStructured: true,
      };
    }
  } catch {
    // Legacy plain-text assistant messages remain supported.
  }

  return {
    response: raw,
    coverLetterDraft: null,
    coverLetterKind: null,
    resumePatch: null,
    fitBrief: null,
    claimPlan: null,
    evidenceSelection: null,
    review: null,
    runtimePlan: null,
    toolTrace: null,
    executionTrace: null,
    isStructured: false,
  };
}

export function getGhostwriterDisplayText(
  content: string | null | undefined,
): string {
  return parseGhostwriterAssistantContent(content).response;
}

export function getGhostwriterCoverLetterDraft(
  content: string | null | undefined,
): string {
  const parsed = parseGhostwriterAssistantContent(content);
  if (parsed.coverLetterDraft) return parsed.coverLetterDraft;
  return parsed.response.trim();
}
