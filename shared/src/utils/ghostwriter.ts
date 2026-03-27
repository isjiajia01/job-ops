import { z } from "zod";
import type {
  GhostwriterAssistantPayload,
  GhostwriterResumePatch,
  GhostwriterSkillGroup,
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
});

export const companyResearchNoteSchema = z.object({
  company: z.string().trim().min(1).max(200),
  source: z.string().trim().max(2000).nullable().default(null),
  summary: z.string().trim().min(1).max(2400),
});

export const candidateKnowledgeBaseSchema = z.object({
  personalFacts: z.array(candidateKnowledgeFactSchema).max(200),
  projects: z.array(candidateKnowledgeProjectSchema).max(200),
  companyResearchNotes: z.array(companyResearchNoteSchema).max(200).default([]),
});

export const ghostwriterAssistantPayloadSchema = z.object({
  response: z.string(),
  coverLetterDraft: z.string().trim().max(12000).nullable().optional(),
  coverLetterKind: z.enum(["letter", "email"]).nullable().optional(),
  resumePatch: ghostwriterResumePatchSchema.nullable().optional(),
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
