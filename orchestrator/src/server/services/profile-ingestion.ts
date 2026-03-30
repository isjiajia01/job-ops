import { logger } from "@infra/logger";
import { LlmService } from "@server/services/llm/service";
import type { JsonSchemaDefinition } from "@server/services/llm/types";
import { resolveLlmRuntimeSettings } from "@server/services/modelSelection";
import { getCandidateKnowledgeBase } from "@server/services/candidate-knowledge";
import { getProfile } from "@server/services/profile";
import type {
  CandidateKnowledgeBase,
  CandidateKnowledgeInboxItem,
  ResumeProfile,
} from "@shared/types";
import { candidateKnowledgeInboxItemSchema } from "@shared/utils/ghostwriter";
import { z } from "zod";

const ingestionResponseSchema = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum(["project", "fact", "preference", "general"]),
        title: z.string().trim().min(1).max(160),
        summary: z.string().trim().min(1).max(2000),
        tags: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
        confidence: z.enum(["low", "medium", "high"]).default("medium"),
        suggestedFact: z
          .object({
            title: z.string().trim().min(1).max(160),
            detail: z.string().trim().min(1).max(2000),
          })
          .nullable()
          .default(null),
        suggestedProject: z
          .object({
            name: z.string().trim().min(1).max(160),
            summary: z.string().trim().min(1).max(2400),
            keywords: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
            role: z.string().trim().max(200).nullable().default(null),
            impact: z.string().trim().max(1200).nullable().default(null),
            roleRelevance: z.string().trim().max(1200).nullable().default(null),
          })
          .nullable()
          .default(null),
        suggestedPreference: z
          .object({
            label: z.string().trim().min(1).max(160),
            instruction: z.string().trim().min(1).max(2000),
            kind: z
              .enum(["tone", "positioning", "guardrail", "phrase", "priority"])
              .default("positioning"),
            strength: z.enum(["normal", "strong"]).default("normal"),
          })
          .nullable()
          .default(null),
      }),
    )
    .max(8),
});

const INGESTION_JSON_SCHEMA: JsonSchemaDefinition = {
  name: "ghostwriter_memory_ingestion",
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["project", "fact", "preference", "general"],
            },
            title: { type: "string" },
            summary: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            suggestedFact: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    detail: { type: "string" },
                  },
                  required: ["title", "detail"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
            suggestedProject: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    summary: { type: "string" },
                    keywords: {
                      type: "array",
                      items: { type: "string" },
                    },
                    role: { type: ["string", "null"] },
                    impact: { type: ["string", "null"] },
                    roleRelevance: { type: ["string", "null"] },
                  },
                  required: [
                    "name",
                    "summary",
                    "keywords",
                    "role",
                    "impact",
                    "roleRelevance",
                  ],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
            suggestedPreference: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    instruction: { type: "string" },
                    kind: {
                      type: "string",
                      enum: [
                        "tone",
                        "positioning",
                        "guardrail",
                        "phrase",
                        "priority",
                      ],
                    },
                    strength: {
                      type: "string",
                      enum: ["normal", "strong"],
                    },
                  },
                  required: ["label", "instruction", "kind", "strength"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
          },
          required: [
            "kind",
            "title",
            "summary",
            "tags",
            "confidence",
            "suggestedFact",
            "suggestedProject",
            "suggestedPreference",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

type IngestionSchema = z.infer<typeof ingestionResponseSchema>;

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function collectProfileDigest(profile: ResumeProfile): string {
  const parts = [
    profile.basics?.headline,
    profile.basics?.summary,
    profile.sections?.summary?.content,
    ...(profile.sections?.skills?.items ?? []).map((item) => item.name),
    ...(profile.sections?.experience?.items ?? []).flatMap((item) => [
      item.position,
      item.company,
      item.summary,
    ]),
    ...(profile.sections?.projects?.items ?? []).flatMap((item) => [
      item.name,
      item.summary,
      item.description,
    ]),
  ]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 30);

  return parts.join("\n");
}

function collectKnowledgeDigest(knowledge: CandidateKnowledgeBase): string {
  const parts = [
    ...knowledge.personalFacts.flatMap((item) => [item.title, item.detail]),
    ...knowledge.projects.flatMap((item) => [
      item.name,
      item.summary,
      ...(item.keywords ?? []),
      item.role ?? "",
      item.impact ?? "",
    ]),
    ...(knowledge.writingPreferences ?? []).flatMap((item) => [
      item.label,
      item.instruction,
    ]),
  ]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 40);

  return parts.join("\n");
}

function firstSentence(text: string): string {
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);
  return sentence ?? text.trim();
}

function titleFromChunk(chunk: string, fallbackPrefix: string): string {
  const line = chunk
    .split("\n")
    .map((item) => item.replace(/^[-*•\d.\s]+/, "").trim())
    .find(Boolean);
  if (!line) return `${fallbackPrefix} note`;
  if (line.length <= 72) return line;
  return `${line.slice(0, 69).trim()}…`;
}

const KEYWORD_TAGS = [
  "planning",
  "forecasting",
  "decision support",
  "operations research",
  "last-mile",
  "logistics",
  "route planning",
  "python",
  "excel",
  "reporting",
  "stakeholder",
  "optimization",
  "process improvement",
  "supply chain",
  "automation",
  "danmark",
  "tone",
  "guardrail",
  "medtech",
  "operations",
];

function extractTags(text: string): string[] {
  const normalized = text.toLowerCase();
  return KEYWORD_TAGS.filter((tag) => normalized.includes(tag)).slice(0, 6);
}

function inferKind(chunk: string): CandidateKnowledgeInboxItem["kind"] {
  const normalized = chunk.toLowerCase();
  if (["avoid", "do not", "don't", "prefer", "tone", "write like"].some((token) => normalized.includes(token))) {
    return "preference";
  }
  if (["project", "built", "implemented", "thesis", "internship", "automated", "model", "developed", "simulator", "dashboard"].some((token) => normalized.includes(token))) {
    return "project";
  }
  if (["target", "visa", "language", "graduat", "authorized", "located"].some((token) => normalized.includes(token))) {
    return "fact";
  }
  return "general";
}

function heuristicFallback(rawText: string, sourceLabel: string): CandidateKnowledgeInboxItem[] {
  const chunks = rawText
    .split(/\n\s*\n|(?=^[-*•]\s)/gm)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 8);
  const now = new Date().toISOString();
  return chunks.map((chunk, index) => {
    const kind = inferKind(chunk);
    return candidateKnowledgeInboxItemSchema.parse({
      id: createId("inbox"),
      createdAt: now,
      updatedAt: now,
      kind,
      status: "pending",
      sourceLabel: sourceLabel.trim() || null,
      title: titleFromChunk(chunk, `Capture ${index + 1}`),
      summary: firstSentence(chunk).slice(0, 320),
      rawText: chunk,
      tags: extractTags(chunk),
      confidence: "medium",
      suggestedFact:
        kind === "fact" || kind === "general"
          ? {
              title: titleFromChunk(chunk, `Fact ${index + 1}`),
              detail: chunk.slice(0, 2000),
            }
          : null,
      suggestedProject:
        kind === "project"
          ? {
              name: titleFromChunk(chunk, `Project ${index + 1}`),
              summary: chunk.slice(0, 2400),
              keywords: extractTags(chunk),
              role: null,
              impact: firstSentence(chunk).slice(0, 400),
              roleRelevance: null,
            }
          : null,
      suggestedPreference:
        kind === "preference"
          ? {
              label: titleFromChunk(chunk, `Preference ${index + 1}`),
              instruction: chunk.slice(0, 2000),
              kind: /avoid|do not|don't|never/.test(chunk.toLowerCase())
                ? "guardrail"
                : "positioning",
              strength: /must|always|never|do not|don't/.test(chunk.toLowerCase())
                ? "strong"
                : "normal",
            }
          : null,
    });
  });
}

function buildSystemPrompt(args: {
  profileDigest: string;
  knowledgeDigest: string;
}): string {
  return [
    "You are an ingestion planner for Ghostwriter Memory Studio.",
    "Turn raw user notes into structured inbox items for later acceptance into facts, projects, or writing preferences.",
    "Return JSON only.",
    "Prioritize extraction quality over coverage.",
    "Rules:",
    "- Preserve truthfulness; never invent achievements, technologies, or seniority.",
    "- Prefer project items when the text describes work shipped, built, modeled, analyzed, or improved.",
    "- Prefer fact items for durable personal truths like target roles, location, work authorization, languages, graduation timing, or strengths.",
    "- Prefer preference items when the user states how Ghostwriter should write, frame, or avoid certain claims.",
    "- Produce concise titles and summaries, but keep suggested payloads concrete.",
    "- Every item MUST include kind, title, summary, tags, confidence, suggestedFact, suggestedProject, suggestedPreference.",
    "- If an item is a project, suggestedProject.summary must always be filled with a concrete summary.",
    "- If an item is not a project, set suggestedProject to null.",
    "- If an item is not a fact, set suggestedFact to null.",
    "- If an item is not a preference, set suggestedPreference to null.",
    "- suggestedProject.roleRelevance should explain which role families this evidence supports.",
    "- suggestedProject.impact should explain why the project matters, even if there are no hard metrics.",
    "- suggestedPreference should convert writing wishes into durable instructions.",
    "- Use tags that are short, reusable, and role-relevant.",
    "Current profile digest:",
    args.profileDigest || "(empty)",
    "Current knowledge digest:",
    args.knowledgeDigest || "(empty)",
  ].join("\n");
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeLooseIngestionItems(
  raw: unknown,
  fallbackItems: CandidateKnowledgeInboxItem[],
  sourceLabel: string | null,
  rawText: string,
): CandidateKnowledgeInboxItem[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const rawItems = Array.isArray(record?.items)
    ? record?.items
    : Array.isArray(raw)
      ? raw
      : record
        ? [record]
        : [];

  const now = new Date().toISOString();

  return rawItems
    .map((entry, index) => {
      const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const fallback = fallbackItems[index] ?? fallbackItems[0] ?? null;
      const suggestedProjectRaw =
        item.suggestedProject && typeof item.suggestedProject === "object"
          ? (item.suggestedProject as Record<string, unknown>)
          : item;
      const suggestedFactRaw =
        item.suggestedFact && typeof item.suggestedFact === "object"
          ? (item.suggestedFact as Record<string, unknown>)
          : item;
      const suggestedPreferenceRaw =
        item.suggestedPreference && typeof item.suggestedPreference === "object"
          ? (item.suggestedPreference as Record<string, unknown>)
          : item;

      const inferredKind =
        (toTrimmedString(item.kind) as CandidateKnowledgeInboxItem["kind"] | null) ??
        inferKind(
          [
            toTrimmedString(item.title),
            toTrimmedString(item.summary),
            toTrimmedString(item.response),
            toTrimmedString(item.content),
            rawText,
          ]
            .filter(Boolean)
            .join("\n"),
        );

      const title =
        toTrimmedString(item.title) ??
        toTrimmedString(item.label) ??
        toTrimmedString(suggestedProjectRaw.name) ??
        toTrimmedString(suggestedFactRaw.title) ??
        toTrimmedString(suggestedPreferenceRaw.label) ??
        fallback?.title ??
        titleFromChunk(rawText, `Capture ${index + 1}`);

      const summary =
        toTrimmedString(item.summary) ??
        toTrimmedString(item.description) ??
        toTrimmedString(item.response) ??
        toTrimmedString(item.content) ??
        toTrimmedString(suggestedProjectRaw.summary) ??
        toTrimmedString(suggestedFactRaw.detail) ??
        toTrimmedString(suggestedPreferenceRaw.instruction) ??
        fallback?.summary ??
        firstSentence(rawText).slice(0, 320);

      const tagsSource = Array.isArray(item.tags)
        ? item.tags
        : Array.isArray(item.keywords)
          ? item.keywords
          : Array.isArray(suggestedProjectRaw.keywords)
            ? suggestedProjectRaw.keywords
            : [];
      const tags = tagsSource
        .map((tag) => toTrimmedString(tag))
        .filter((tag): tag is string => Boolean(tag));

      const kind = inferredKind;
      const suggestedProject =
        kind === "project"
          ? {
              name:
                toTrimmedString(suggestedProjectRaw.name) ??
                title,
              summary:
                toTrimmedString(suggestedProjectRaw.summary) ??
                summary,
              keywords:
                (Array.isArray(suggestedProjectRaw.keywords)
                  ? suggestedProjectRaw.keywords
                  : tags
                )
                  .map((tag) => toTrimmedString(tag))
                  .filter((tag): tag is string => Boolean(tag))
                  .slice(0, 12),
              role: toTrimmedString(suggestedProjectRaw.role),
              impact:
                toTrimmedString(suggestedProjectRaw.impact) ??
                firstSentence(summary).slice(0, 400),
              roleRelevance: toTrimmedString(suggestedProjectRaw.roleRelevance),
            }
          : null;

      const suggestedFact =
        kind === "fact"
          ? {
              title: toTrimmedString(suggestedFactRaw.title) ?? title,
              detail:
                toTrimmedString(suggestedFactRaw.detail) ??
                summary,
            }
          : null;

      const suggestedPreference =
        kind === "preference"
          ? {
              label: toTrimmedString(suggestedPreferenceRaw.label) ?? title,
              instruction:
                toTrimmedString(suggestedPreferenceRaw.instruction) ??
                summary,
              kind:
                (toTrimmedString(suggestedPreferenceRaw.kind) as
                  | "tone"
                  | "positioning"
                  | "guardrail"
                  | "phrase"
                  | "priority"
                  | null) ??
                (/avoid|do not|don't|never/i.test(rawText)
                  ? "guardrail"
                  : "positioning"),
              strength:
                (toTrimmedString(suggestedPreferenceRaw.strength) as
                  | "normal"
                  | "strong"
                  | null) ??
                (/must|always|never|do not|don't/i.test(rawText)
                  ? "strong"
                  : "normal"),
            }
          : null;

      return candidateKnowledgeInboxItemSchema.parse({
        id: createId("inbox"),
        createdAt: now,
        updatedAt: now,
        kind,
        status: "pending",
        sourceLabel,
        title,
        summary,
        rawText,
        tags: tags.length ? tags.slice(0, 8) : extractTags(`${title}\n${summary}\n${rawText}`),
        confidence:
          (toTrimmedString(item.confidence) as "low" | "medium" | "high" | null) ??
          fallback?.confidence ??
          "medium",
        suggestedFact,
        suggestedProject,
        suggestedPreference,
      });
    })
    .filter(Boolean);
}

export async function ingestProfileCapture(args: {
  rawText: string;
  sourceLabel?: string | null;
}): Promise<{ items: CandidateKnowledgeInboxItem[]; mode: "llm" | "fallback" }> {
  const trimmed = args.rawText.trim();
  if (!trimmed) {
    return { items: [], mode: "fallback" };
  }

  const [profile, knowledge] = await Promise.all([
    getProfile().catch(() => ({} as ResumeProfile)),
    getCandidateKnowledgeBase().catch(
      () => ({ personalFacts: [], projects: [] }) as CandidateKnowledgeBase,
    ),
  ]);

  const fallbackItems = heuristicFallback(trimmed, args.sourceLabel ?? "");

  try {
    const runtime = await resolveLlmRuntimeSettings();
    const llm = new LlmService({
      provider: runtime.provider ?? undefined,
      baseUrl: runtime.baseUrl ?? undefined,
      apiKey: runtime.apiKey ?? undefined,
    });

    const response = await llm.callJson<IngestionSchema>({
      model: runtime.model,
      jsonSchema: INGESTION_JSON_SCHEMA,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            profileDigest: collectProfileDigest(profile),
            knowledgeDigest: collectKnowledgeDigest(knowledge),
          }),
        },
        {
          role: "user",
          content: [
            `Source label: ${args.sourceLabel?.trim() || "none"}`,
            "Raw capture:",
            trimmed,
          ].join("\n"),
        },
      ],
      maxRetries: 1,
    });

    if (!response.success || !response.data) {
      logger.warn("Profile ingestion fell back to heuristic digest", {
        error: response.success ? "empty llm response" : response.error,
      });
      return { items: fallbackItems, mode: "fallback" };
    }

    const items = normalizeLooseIngestionItems(
      response.data,
      fallbackItems,
      args.sourceLabel?.trim() || null,
      trimmed,
    );

    if (!items.length) {
      logger.warn("Profile ingestion normalization produced no items; using fallback", {
        responseData: response.data,
      });
      return { items: fallbackItems, mode: "fallback" };
    }

    return { items, mode: "llm" };
  } catch (error) {
    logger.warn("Profile ingestion failed; using heuristic fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { items: fallbackItems, mode: "fallback" };
  }
}
