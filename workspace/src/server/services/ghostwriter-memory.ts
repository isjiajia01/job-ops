import type {
  CandidateKnowledgeBase,
  CandidateKnowledgeFact,
  CandidateKnowledgeProject,
  GhostwriterAssistantPayload,
  GhostwriterWritingPreference,
} from "@shared/types";
import { saveCandidateKnowledgeBase } from "./candidate-knowledge";

export type MemoryUpdateResult = {
  payload: GhostwriterAssistantPayload;
  nextKnowledgeBase: CandidateKnowledgeBase | null;
  saved: {
    facts: number;
    projects: number;
    preferences: number;
  };
};

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

export async function applyMemoryUpdateForPrompt(args: {
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
