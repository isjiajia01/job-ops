import { notFound } from "@infra/errors";
import { settingsRegistry } from "@shared/settings-registry";
import type {
  CandidateKnowledgeBase,
  CandidateKnowledgeFact,
  CandidateKnowledgeProject,
  GhostwriterWritingPreference,
} from "@shared/types";
import { candidateKnowledgeBaseSchema } from "@shared/utils/ghostwriter";
import * as settingsRepo from "../repositories/settings";

function getDefaultKnowledgeBase(): CandidateKnowledgeBase {
  return settingsRegistry.candidateKnowledgeBase.default();
}

export async function getCandidateKnowledgeBase(): Promise<CandidateKnowledgeBase> {
  const raw = await settingsRepo.getSetting("candidateKnowledgeBase");
  return (
    settingsRegistry.candidateKnowledgeBase.parse(raw ?? undefined) ??
    getDefaultKnowledgeBase()
  );
}

export async function saveCandidateKnowledgeBase(
  input: CandidateKnowledgeBase,
): Promise<CandidateKnowledgeBase> {
  const normalized = candidateKnowledgeBaseSchema.parse(input);
  await settingsRepo.setSetting(
    "candidateKnowledgeBase",
    settingsRegistry.candidateKnowledgeBase.serialize(normalized),
  );
  return normalized;
}

export async function addCandidateKnowledgeFact(input: {
  title: string;
  detail: string;
}): Promise<CandidateKnowledgeFact> {
  const knowledgeBase = await getCandidateKnowledgeBase();
  const fact: CandidateKnowledgeFact = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    detail: input.detail.trim(),
  };

  await saveCandidateKnowledgeBase({
    ...knowledgeBase,
    personalFacts: [...knowledgeBase.personalFacts, fact],
  });

  return fact;
}

export async function deleteCandidateKnowledgeFact(id: string): Promise<void> {
  const knowledgeBase = await getCandidateKnowledgeBase();
  const nextFacts = knowledgeBase.personalFacts.filter(
    (item) => item.id !== id,
  );
  if (nextFacts.length === knowledgeBase.personalFacts.length) {
    throw notFound("Personal fact not found");
  }

  await saveCandidateKnowledgeBase({
    ...knowledgeBase,
    personalFacts: nextFacts,
  });
}

export async function addCandidateKnowledgeProject(input: {
  name: string;
  summary: string;
  keywords?: string[];
  role?: string | null;
  impact?: string | null;
  roleRelevance?: string | null;
  cvBullets?: string[];
}): Promise<CandidateKnowledgeProject> {
  const knowledgeBase = await getCandidateKnowledgeBase();
  const project: CandidateKnowledgeProject = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    summary: input.summary.trim(),
    keywords: (input.keywords ?? []).map((item) => item.trim()).filter(Boolean),
    role: input.role?.trim() || null,
    impact: input.impact?.trim() || null,
    roleRelevance: input.roleRelevance?.trim() || null,
    cvBullets: (input.cvBullets ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
  };

  await saveCandidateKnowledgeBase({
    ...knowledgeBase,
    projects: [...knowledgeBase.projects, project],
  });

  return project;
}

export async function addCandidateKnowledgePreference(input: {
  label: string;
  instruction: string;
  kind?: GhostwriterWritingPreference["kind"];
  strength?: GhostwriterWritingPreference["strength"];
}): Promise<GhostwriterWritingPreference> {
  const knowledgeBase = await getCandidateKnowledgeBase();
  const preference: GhostwriterWritingPreference = {
    id: crypto.randomUUID(),
    label: input.label.trim(),
    instruction: input.instruction.trim(),
    kind: input.kind ?? "positioning",
    strength: input.strength ?? "normal",
  };

  await saveCandidateKnowledgeBase({
    ...knowledgeBase,
    writingPreferences: [
      ...(knowledgeBase.writingPreferences ?? []),
      preference,
    ],
  });

  return preference;
}

export async function deleteCandidateKnowledgeProject(
  id: string,
): Promise<void> {
  const knowledgeBase = await getCandidateKnowledgeBase();
  const nextProjects = knowledgeBase.projects.filter((item) => item.id !== id);
  if (nextProjects.length === knowledgeBase.projects.length) {
    throw notFound("Project not found");
  }

  await saveCandidateKnowledgeBase({
    ...knowledgeBase,
    projects: nextProjects,
  });
}
