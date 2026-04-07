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
import {
  lintCoverLetterDraft,
  sanitizeResumePatch,
  scoreGhostwriterCandidate,
} from "./ghostwriter-output-guard";
import { LlmService } from "./llm/service";
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

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function normalizeMemoryKey(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .trim();
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

type MemoryUpdateResult = {
  payload: GhostwriterAssistantPayload;
  nextKnowledgeBase: CandidateKnowledgeBase | null;
  saved: {
    facts: number;
    projects: number;
    preferences: number;
  };
};

function upsertFact(
  facts: CandidateKnowledgeFact[],
  fact: CandidateKnowledgeFact,
): { items: CandidateKnowledgeFact[]; created: boolean } {
  const key = normalizeMemoryKey(fact.title);
  const existingIndex = facts.findIndex(
    (item) => normalizeMemoryKey(item.title) === key,
  );
  if (existingIndex >= 0) {
    const next = [...facts];
    next[existingIndex] = { ...next[existingIndex], ...fact };
    return { items: next, created: false };
  }
  return { items: [fact, ...facts], created: true };
}

function upsertProject(
  projects: CandidateKnowledgeProject[],
  project: CandidateKnowledgeProject,
): { items: CandidateKnowledgeProject[]; created: boolean } {
  const key = normalizeMemoryKey(project.name);
  const existingIndex = projects.findIndex(
    (item) => normalizeMemoryKey(item.name) === key,
  );
  if (existingIndex >= 0) {
    const mergedKeywords = dedupeByKey(
      [
        ...(projects[existingIndex]?.keywords ?? []),
        ...(project.keywords ?? []),
      ],
      (item) => normalizeMemoryKey(item),
    );
    const mergedBullets = dedupeByKey(
      [
        ...(project.cvBullets ?? []),
        ...(projects[existingIndex]?.cvBullets ?? []),
      ],
      (item) => normalizeMemoryKey(item),
    ).slice(0, 8);
    const next = [...projects];
    next[existingIndex] = {
      ...next[existingIndex],
      ...project,
      keywords: mergedKeywords,
      cvBullets: mergedBullets,
    };
    return { items: next, created: false };
  }
  return { items: [project, ...projects], created: true };
}

function upsertPreference(
  preferences: GhostwriterWritingPreference[],
  preference: GhostwriterWritingPreference,
): { items: GhostwriterWritingPreference[]; created: boolean } {
  const key = normalizeMemoryKey(preference.label);
  const existingIndex = preferences.findIndex(
    (item) => normalizeMemoryKey(item.label) === key,
  );
  if (existingIndex >= 0) {
    const next = [...preferences];
    next[existingIndex] = { ...next[existingIndex], ...preference };
    return { items: next, created: false };
  }
  return { items: [preference, ...preferences], created: true };
}

function trimMemoryPrompt(prompt: string): string {
  return prompt
    .replace(
      /^[\s,，。:：-]*(记住|记一下|remember this|please remember|keep this in mind)\s*/i,
      "",
    )
    .replace(/[\s,，。!！]*你记住了?$/i, "")
    .trim();
}

async function applyMemoryUpdateForPrompt(args: {
  prompt: string;
  knowledgeBase: CandidateKnowledgeBase;
}): Promise<MemoryUpdateResult> {
  const trimmedPrompt = args.prompt.trim();
  const lower = trimmedPrompt.toLowerCase();
  const isChinese = hasCjk(trimmedPrompt);
  const nextKnowledgeBase: CandidateKnowledgeBase = {
    ...args.knowledgeBase,
    personalFacts: [...(args.knowledgeBase.personalFacts ?? [])],
    projects: [...(args.knowledgeBase.projects ?? [])],
    companyResearchNotes: [...(args.knowledgeBase.companyResearchNotes ?? [])],
    writingPreferences: [...(args.knowledgeBase.writingPreferences ?? [])],
    inboxItems: [...(args.knowledgeBase.inboxItems ?? [])],
  };

  let savedFacts = 0;
  let savedProjects = 0;
  let savedPreferences = 0;

  const mentionsMover = /\bmover\b/i.test(trimmedPrompt);
  const mentionsThesisContext =
    /dtu|master'?s thesis|masters thesis|thesis|optimization research|last-mile|rolling-horizon|delivery|合作|一起做|collaboration|毕业|论文|研究/.test(
      lower,
    );

  const savedMoverThesisFraming = mentionsMover && mentionsThesisContext;

  if (savedMoverThesisFraming) {
    const project: CandidateKnowledgeProject = {
      id: "project-mover-dtu-thesis",
      name: "Mover x DTU Master's Thesis",
      summary:
        "Master's thesis / optimization research conducted in collaboration with Mover, focused on a multi-day rolling-horizon planning problem in last-mile delivery under real operational constraints.",
      keywords: [
        "Mover",
        "DTU",
        "optimization",
        "operations research",
        "last-mile delivery",
        "rolling-horizon planning",
        "routing",
        "decision support",
      ],
      role: "Master's Thesis / Optimization Research (in collaboration with Mover)",
      impact:
        "Strong evidence for planning, logistics, optimisation, and decision-support roles; frame it as a real operations-linked collaboration rather than a standalone academic thesis.",
      roleRelevance:
        "Best used as a lead narrative module for planning, optimisation, logistics, and decision-support roles where real operational constraints matter.",
      cvBullets: [
        "Working on a multi-day rolling-horizon planning problem in last-mile delivery, combining assignment, routing, runtime limits, and stability-aware re-optimization.",
        "Modelling planning decisions under operational constraints, including service windows, heterogeneous resources, and evolving daily demand.",
        "Using optimization and computational methods to evaluate feasible planning approaches and support structured operational decision-making in a real operations-linked context.",
      ],
    };

    const fact: CandidateKnowledgeFact = {
      id: "fact-mover-dtu-thesis-collab",
      title: "DTU thesis collaboration framing",
      detail:
        "The DTU master's thesis / optimization research (2025–2026) is done in collaboration with Mover and should be framed as a real operational collaboration rather than a purely independent academic thesis.",
    };

    const preference: GhostwriterWritingPreference = {
      id: "pref-mover-dtu-thesis-framing",
      label: "Frame DTU thesis as Mover collaboration",
      instruction:
        "When referencing the DTU master's thesis, frame it as optimization research conducted in collaboration with Mover and tied to a real operational planning problem, not as a purely standalone academic project.",
      kind: "positioning",
      strength: "strong",
    };

    const nextFacts = upsertFact(nextKnowledgeBase.personalFacts, fact);
    nextKnowledgeBase.personalFacts = nextFacts.items;
    savedFacts += nextFacts.created ? 1 : 0;

    const nextProjects = upsertProject(nextKnowledgeBase.projects, project);
    nextKnowledgeBase.projects = nextProjects.items;
    savedProjects += nextProjects.created ? 1 : 0;

    const nextPreferences = upsertPreference(
      nextKnowledgeBase.writingPreferences ?? [],
      preference,
    );
    nextKnowledgeBase.writingPreferences = nextPreferences.items;
    savedPreferences += nextPreferences.created ? 1 : 0;
  } else {
    const cleaned = trimMemoryPrompt(trimmedPrompt);
    if (!cleaned) {
      return {
        payload: {
          response: isChinese
            ? "我可以记，但你先给我一句更具体的事实、表述规则，或经历纠正。"
            : "I can remember that, but give me one more concrete fact, framing rule, or experience correction to store.",
          coverLetterDraft: null,
          coverLetterKind: null,
          resumePatch: null,
        },
        nextKnowledgeBase: null,
        saved: { facts: 0, projects: 0, preferences: 0 },
      };
    }

    const fact: CandidateKnowledgeFact = {
      id: `fact-memory-${crypto.randomUUID()}`,
      title: isChinese ? "Ghostwriter memory note" : "Ghostwriter memory note",
      detail: cleaned,
    };
    const nextFacts = upsertFact(nextKnowledgeBase.personalFacts, fact);
    nextKnowledgeBase.personalFacts = nextFacts.items;
    savedFacts += nextFacts.created ? 1 : 0;
  }

  await saveCandidateKnowledgeBase(nextKnowledgeBase);

  const savedSummary = [
    savedProjects ? `${savedProjects} project note` : null,
    savedFacts ? `${savedFacts} fact` : null,
    savedPreferences ? `${savedPreferences} writing rule` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    payload: {
      response: savedMoverThesisFraming
        ? isChinese
          ? `记住了。我后面会把这段按与 Mover 相关的真实运营合作来写，不再把它当成纯学术 thesis。${savedSummary ? ` 已更新：${savedSummary}。` : ""}`
          : `Got it. I’ll treat this as operations-linked work with Mover rather than a standalone academic thesis going forward.${savedSummary ? ` Updated: ${savedSummary}.` : ""}`
        : isChinese
          ? `记住了，我后面会按这条事实来写。${savedSummary ? ` 已更新：${savedSummary}。` : ""}`
          : `Got it. I’ll use that as a saved profile fact going forward.${savedSummary ? ` Updated: ${savedSummary}.` : ""}`,
      coverLetterDraft: null,
      coverLetterKind: null,
      resumePatch: null,
    },
    nextKnowledgeBase,
    saved: {
      facts: savedFacts,
      projects: savedProjects,
      preferences: savedPreferences,
    },
  };
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

function buildBaseLlmMessages(args: {
  systemPrompt: string;
  jobSnapshot: string;
  profileSnapshot: string;
  companyResearchSnapshot: string;
  evidencePackSnapshot: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  return [
    {
      role: "system" as const,
      content: args.systemPrompt,
    },
    {
      role: "system" as const,
      content: `Job Context (JSON):\n${args.jobSnapshot}`,
    },
    {
      role: "system" as const,
      content: `Profile Context:\n${args.profileSnapshot || "No profile context available."}`,
    },
    ...(args.companyResearchSnapshot
      ? [
          {
            role: "system" as const,
            content: `Company Research Context:\n${args.companyResearchSnapshot}`,
          },
        ]
      : []),
    {
      role: "system" as const,
      content: `Evidence Pack:\n${args.evidencePackSnapshot}`,
    },
    ...args.history,
  ];
}

function isPartialCoverLetterRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const asksCoverLetter =
    /cover[ -]?letter|motivation letter|application letter/.test(normalized);
  const asksPartial =
    /opening|intro|introduction|hook|paragraph|2-sentence|two-sentence|sentence|closing line|closing paragraph/.test(
      normalized,
    );
  return asksCoverLetter && asksPartial;
}

function stripLeadingSalutationBlock(text: string): string {
  const trimmed = text.trim();
  return trimmed.replace(/^Dear[^\n]*\n\n/i, "").trim();
}

function isDirectBulletRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return (
    /\bbullets?\b/.test(normalized) &&
    /just give the wording|just the wording|resume/.test(normalized)
  );
}

function countBulletLines(text: string): number {
  return text
    .split("\n")
    .filter((line) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(line)).length;
}

function normalizeBulletSentence(text: string): string {
  return text
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")
    .trim()
    .replace(/[.;:,\s]+$/, "");
}

function buildFallbackBulletResponse(
  evidencePack: GhostwriterEvidencePack,
): string | null {
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
    .filter(
      (line) =>
        line.length >= 28 &&
        !/^lead module:|^support module:|^optional third signal:/i.test(line) &&
        !/^strong evidence\b|^use this as\b|^lead with\b|^support for\b|^best evidence\b|^primary evidence\b|^important execution evidence\b|^useful bridge\b/i.test(
          line,
        ) &&
        !/especially useful when a role values|rather than a generic school project/i.test(
          line,
        ) &&
        !/@/.test(line),
    );

  const uniqueLines: string[] = [];
  for (const line of candidateLines) {
    if (
      uniqueLines.some(
        (existing) => existing.toLowerCase() === line.toLowerCase(),
      )
    ) {
      continue;
    }
    uniqueLines.push(line);
    if (uniqueLines.length === 3) break;
  }

  if (uniqueLines.length < 2) return null;

  if (uniqueLines.length < 3) {
    uniqueLines.push(
      evidencePack.targetRoleFamily === "analytics-and-decision-support"
        ? "Turned recurring analysis into stakeholder-ready materials, reporting structure, and practical follow-up for day-to-day business decisions"
        : evidencePack.targetRoleFamily === "planning-and-operations"
          ? "Translated planning analysis into practical decision support that could help day-to-day operational coordination under changing constraints"
          : "Turned structured modelling work into decision-useful outputs that stayed practical, grounded, and relevant to real operational needs",
    );
  }

  return uniqueLines
    .slice(0, 3)
    .map((line) => `• ${line}.`)
    .join("\n");
}

function sharpenBulletListResponse(text: string): string {
  const lines = text.split("\n");
  const bulletIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*[-•*]/.test(line));

  if (bulletIndexes.length < 3) return text;

  const lower = text.toLowerCase();
  const last = bulletIndexes[bulletIndexes.length - 1];
  const genericSupportPattern =
    /supported (day-to-day )?(business analysis|business follow-up|practical business analysis tasks|ongoing business follow-up)/i;

  if (!genericSupportPattern.test(last.line)) return text;

  let replacement = last.line;
  if (/python|excel|reporting|decision-ready|stakeholder/.test(lower)) {
    replacement =
      last.line.charAt(0) +
      " Built a reliable bridge from recurring reporting and operational analysis to stakeholder-ready materials, documentation, and practical follow-up.";
  } else if (
    /planning|routing|delivery|logistics|operational constraints/.test(lower)
  ) {
    replacement =
      last.line.charAt(0) +
      " Turned logistics-planning analysis into structured, decision-useful outputs that could support day-to-day operational coordination.";
  }

  const next = [...lines];
  next[last.index] = replacement;
  return next.join("\n");
}

function buildFitBrief(
  evidencePack?: GhostwriterEvidencePack,
): GhostwriterFitBrief | null {
  if (!evidencePack) return null;
  const strongestPoints = [
    ...evidencePack.topFitReasons,
    ...evidencePack.topEvidence,
  ].slice(0, 4);
  const risks = [
    ...evidencePack.biggestGaps,
    ...evidencePack.forbiddenClaims,
  ].slice(0, 4);
  if (!strongestPoints.length && !risks.length && !evidencePack.recommendedAngle) {
    return null;
  }
  return {
    strongestPoints,
    risks,
    recommendedAngle: evidencePack.recommendedAngle || null,
  };
}

function finalizePayloadCandidate(args: {
  raw: unknown;
  prompt?: string;
  profile: Awaited<ReturnType<typeof buildJobChatPromptContext>>["profile"];
  knowledgeBase: Awaited<
    ReturnType<typeof buildJobChatPromptContext>
  >["knowledgeBase"];
  evidencePack?: GhostwriterEvidencePack;
  runtimeState?: ReturnType<typeof buildGhostwriterRuntimeState>;
}): GhostwriterAssistantPayload {
  const payload = normalizeGhostwriterAssistantPayload(args.raw);
  if (!payload) {
    throw upstreamError("LLM returned an invalid Ghostwriter payload");
  }

  const { sanitized: sanitizedCoverLetterDraft } = lintCoverLetterDraft(
    payload.coverLetterDraft,
  );
  const sanitizedResumePatch = payload.resumePatch
    ? sanitizeResumePatch({
        patch: payload.resumePatch,
        profile: args.profile,
        knowledgeBase: args.knowledgeBase,
      }).sanitized
    : null;
  const fallbackBulletResponse =
    args.prompt &&
    isDirectBulletRequest(args.prompt) &&
    countBulletLines(payload.response) < 3 &&
    args.evidencePack
      ? buildFallbackBulletResponse(args.evidencePack)
      : null;

  if (
    sanitizedCoverLetterDraft &&
    args.prompt &&
    isPartialCoverLetterRequest(args.prompt)
  ) {
    return {
      ...payload,
      response: stripLeadingSalutationBlock(sanitizedCoverLetterDraft),
      coverLetterDraft: null,
      coverLetterKind: null,
      resumePatch: sanitizedResumePatch,
      fitBrief: payload.fitBrief ?? buildFitBrief(args.evidencePack),
      runtimePlan: args.runtimeState?.plan ?? payload.runtimePlan ?? null,
      toolTrace: args.runtimeState?.toolResults ?? payload.toolTrace ?? null,
      executionTrace:
        args.runtimeState?.executionTrace ?? payload.executionTrace ?? null,
    };
  }

  const baseResponse = fallbackBulletResponse ?? payload.response;
  const sharpenedResponse = payload.coverLetterDraft
    ? baseResponse
    : sharpenBulletListResponse(baseResponse);

  return {
    ...payload,
    response: sharpenedResponse,
    coverLetterDraft: sanitizedCoverLetterDraft,
    resumePatch: sanitizedResumePatch,
    fitBrief: payload.fitBrief ?? buildFitBrief(args.evidencePack),
    runtimePlan: args.runtimeState?.plan ?? payload.runtimePlan ?? null,
    toolTrace: args.runtimeState?.toolResults ?? payload.toolTrace ?? null,
    executionTrace:
      args.runtimeState?.executionTrace ?? payload.executionTrace ?? null,
  };
}

function rankPayloadCandidates(args: {
  candidates: Array<GhostwriterAssistantPayload & { __variantName?: string }>;
  evidencePackSnapshot: string;
  profile: Awaited<ReturnType<typeof buildJobChatPromptContext>>["profile"];
  knowledgeBase: Awaited<
    ReturnType<typeof buildJobChatPromptContext>
  >["knowledgeBase"];
}): {
  ranked: Array<{
    index: number;
    candidate: GhostwriterAssistantPayload & { __variantName?: string };
    evaluation: ReturnType<typeof scoreGhostwriterCandidate>;
  }>;
  winner: GhostwriterAssistantPayload & { __variantName?: string };
} {
  const ranked = args.candidates
    .map((candidate, index) => ({
      index,
      candidate,
      evaluation: scoreGhostwriterCandidate({
        payload: candidate,
        evidencePackText: args.evidencePackSnapshot,
        profile: args.profile,
        knowledgeBase: args.knowledgeBase,
      }),
    }))
    .sort((a, b) => b.evaluation.score - a.evaluation.score);

  return {
    ranked,
    winner: ranked[0]?.candidate ?? args.candidates[0],
  };
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

async function emitRunTimelineEvent<TType extends JobChatRunEventType>(
  run: JobChatRun,
  options: GenerateReplyOptions,
  input: {
    phase: JobChatRunPhase;
    eventType: TType;
    title: string;
    detail?: string | null;
    payload: JobChatRunEventPayloadByType[TType];
  },
): Promise<JobChatRunEvent> {
  const event = await jobChatRepo.createRunEvent({
    runId: run.id,
    threadId: run.threadId,
    jobId: run.jobId,
    phase: input.phase,
    eventType: input.eventType,
    title: input.title,
    detail: input.detail ?? null,
    payload: input.payload ?? null,
  });
  options.stream?.onTimeline?.({ runId: run.id, event });
  return event;
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
  await emitRunTimelineEvent(run, options, {
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
  });

  let accumulated = "";

  try {
    const llm = new LlmService({
      provider: llmConfig.provider,
      baseUrl: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
    });

    const taskKind = classifyGhostwriterTask(options.prompt);
    await emitRunTimelineEvent(run, options, {
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
    });
    const runtimeState = buildGhostwriterRuntimeState({
      context,
      prompt: options.prompt,
      taskKind,
    });
    await emitRunTimelineEvent(run, options, {
      phase: "runtime",
      eventType: "runtime_planned",
      title: "Runtime planned",
      detail: runtimeState.plan.deliverable,
      payload: {
        taskKind: runtimeState.plan.taskKind,
        responseMode: runtimeState.plan.responseMode,
        selectedTools: runtimeState.plan.selectedTools,
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
    let selectionMeta: {
      candidateCount?: number;
      winnerReason: string;
      winningVariant?: string;
      strongestEvidence?: string[];
    } | null = null;

    if (taskKind === "memory_update") {
      await emitRunTimelineEvent(run, options, {
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
      await emitRunTimelineEvent(run, options, {
        phase: "generation",
        eventType: "direct_reply",
        title: "Generating direct reply",
        detail: "Using the runtime brief to produce a concise answer or wording help response.",
        payload: {
          prompt: options.prompt,
          responseMode: runtimeState.plan.responseMode,
        },
      });
      const llmResult = await llm.callJson<{ response: string }>({
        model: llmConfig.model,
        messages: [
          ...baseMessages,
          ...runtimeMessages,
          {
            role: "user",
            content: options.prompt,
          },
        ],
        jsonSchema: CHAT_RESPONSE_SCHEMA,
        maxRetries: 1,
        retryDelayMs: 300,
        jobId: options.jobId,
        signal: controller.signal,
      });

      if (!llmResult.success) {
        if (controller.signal.aborted) {
          throw requestTimeout("Chat generation was cancelled");
        }
        throw upstreamError("LLM generation failed", {
          reason: llmResult.error,
        });
      }

      structuredPayload = finalizePayloadCandidate({
        raw: llmResult.data,
        prompt: options.prompt,
        profile: context.profile,
        knowledgeBase: context.knowledgeBase,
        evidencePack: context.evidencePack,
        runtimeState,
      });
    } else {
      const strategyPrompt = [
        `Task kind: ${taskKind}`,
        `User request: ${options.prompt}`,
        "Build a compact writing strategy using the evidence pack. Focus on the best angle, strongest evidence, weak points to manage, and a practical paragraph plan.",
        "Set requiresClarification to true only if a good draft would clearly suffer without extra user input.",
      ].join("\n\n");

      await emitRunTimelineEvent(run, options, {
        phase: "strategy",
        eventType: "strategy_requested",
        title: "Planning writing strategy",
        detail: "Ghostwriter is first building an explicit strategy before drafting the artifact.",
        payload: {
          prompt: options.prompt,
          taskKind,
        },
      });
      const strategyResult = await llm.callJson<WritingStrategy>({
        model: llmConfig.model,
        messages: [
          ...baseMessages,
          ...runtimeMessages,
          {
            role: "system",
            content:
              "Return a writing strategy JSON only. Do not draft the final answer yet.",
          },
          {
            role: "user",
            content: strategyPrompt,
          },
        ],
        jsonSchema: WRITING_STRATEGY_SCHEMA,
        maxRetries: 1,
        retryDelayMs: 300,
        jobId: options.jobId,
        signal: controller.signal,
      });

      if (!strategyResult.success) {
        if (controller.signal.aborted) {
          throw requestTimeout("Chat generation was cancelled");
        }
        throw upstreamError("Ghostwriter strategy generation failed", {
          reason: strategyResult.error,
        });
      }

      const strategy = {
        ...buildLocalWritingStrategy({
          taskKind,
          evidencePack: context.evidencePack,
        }),
        ...strategyResult.data,
      } satisfies WritingStrategy;
      await emitRunTimelineEvent(run, options, {
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

      if (
        strategy.requiresClarification &&
        strategy.clarifyingQuestions.length
      ) {
        structuredPayload = {
          response: strategy.clarifyingQuestions
            .slice(0, 3)
            .map((question, index) => `${index + 1}. ${question}`)
            .join("\n"),
          coverLetterDraft: null,
          coverLetterKind: null,
          resumePatch: null,
        };
      } else {
        const strategySnapshot = buildStrategySnapshot(strategy);
        const variantDirectives: Array<{
          name: string;
          coverLetterKind: GhostwriterCoverLetterKind | null;
          instruction: string;
        }> = [
          {
            name: "conservative",
            coverLetterKind:
              taskKind === "application_email"
                ? "email"
                : taskKind === "cover_letter" || taskKind === "mixed"
                  ? "letter"
                  : null,
            instruction:
              "Variant profile: safest and most disciplined. Keep every claim tightly evidence-backed and understate weak areas rather than stretching them.",
          },
          {
            name: "balanced",
            coverLetterKind:
              taskKind === "application_email"
                ? "email"
                : taskKind === "cover_letter" || taskKind === "mixed"
                  ? "letter"
                  : null,
            instruction:
              "Variant profile: balanced and practical. Prioritize the recommended angle and make the draft feel specific, useful, and employer-need driven.",
          },
          {
            name: "evidence-heavy",
            coverLetterKind:
              taskKind === "application_email"
                ? "email"
                : taskKind === "cover_letter" || taskKind === "mixed"
                  ? "letter"
                  : null,
            instruction:
              "Variant profile: maximize concrete evidence density. Prefer stronger examples over broader motivation language and keep fluff close to zero.",
          },
        ];

        const candidatePayloads: Array<GhostwriterAssistantPayload & { __variantName?: string }> = [];

        for (const variant of variantDirectives) {
          await emitRunTimelineEvent(run, options, {
            phase: "generation",
            eventType: "variant_requested",
            title: `Drafting ${variant.name} variant`,
            detail: variant.instruction,
            payload: {
              variant: variant.name,
              coverLetterKind: variant.coverLetterKind,
            },
          });
          const variantResult = await llm.callJson<GhostwriterAssistantPayload>(
            {
              model: llmConfig.model,
              messages: [
                ...baseMessages,
                ...runtimeMessages,
                {
                  role: "system",
                  content: `Approved Writing Strategy:\n${strategySnapshot}`,
                },
                {
                  role: "system",
                  content: variant.instruction,
                },
                {
                  role: "user",
                  content: options.prompt,
                },
              ],
              jsonSchema: CHAT_RESPONSE_SCHEMA,
              maxRetries: 1,
              retryDelayMs: 300,
              jobId: options.jobId,
              signal: controller.signal,
            },
          );

          if (!variantResult.success) {
            if (controller.signal.aborted) {
              throw requestTimeout("Chat generation was cancelled");
            }
            throw upstreamError(
              `Ghostwriter ${variant.name} draft generation failed`,
              {
                reason: variantResult.error,
              },
            );
          }

          const candidate = finalizePayloadCandidate({
            raw: variantResult.data,
            prompt: options.prompt,
            profile: context.profile,
            knowledgeBase: context.knowledgeBase,
            evidencePack: context.evidencePack,
            runtimeState,
          });

          candidatePayloads.push({
            ...candidate,
            __variantName: variant.name,
            coverLetterKind: candidate.coverLetterDraft
              ? (candidate.coverLetterKind ?? variant.coverLetterKind)
              : candidate.coverLetterKind,
          });
          await emitRunTimelineEvent(run, options, {
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

        const ranking = rankPayloadCandidates({
          candidates: candidatePayloads,
          evidencePackSnapshot: context.evidencePackSnapshot,
          profile: context.profile,
          knowledgeBase: context.knowledgeBase,
        });
        structuredPayload = ranking.winner;
        const topEvaluation = ranking.ranked[0]?.evaluation;
        selectionMeta = {
          candidateCount: ranking.ranked.length,
          winnerReason:
            topEvaluation?.reasons?.[0] ??
            "This variant best balanced specificity, evidence density, and output usefulness.",
          winningVariant: ranking.winner.__variantName,
          strongestEvidence:
            structuredPayload.fitBrief?.strongestPoints.slice(0, 3) ??
            context.evidencePack.topEvidence.slice(0, 3),
        };
      }
    }

    await emitRunTimelineEvent(run, options, {
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
        await emitRunTimelineEvent(run, options, {
          phase: "terminal",
          eventType: "cancelled",
          title: "Run cancelled",
          detail: "The operator stopped the stream before the response finished.",
          payload: {},
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
    await emitRunTimelineEvent(run, options, {
      phase: "terminal",
      eventType: "completed",
      title: "Run completed",
      detail: "The assistant response was persisted and the stream closed cleanly.",
      payload: {
        outputChars: accumulated.length,
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
      await emitRunTimelineEvent(run, options, {
        phase: "terminal",
        eventType: "cancelled",
        title: "Run cancelled",
        detail: message,
        payload: {},
      });
    } else {
      await emitRunTimelineEvent(run, options, {
        phase: "terminal",
        eventType: "failed",
        title: "Run failed",
        detail: message,
        payload: {
          code,
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
