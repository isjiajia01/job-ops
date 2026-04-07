import type { GhostwriterExperienceModule, JobChatPromptContext } from "./ghostwriter-context";

type GhostwriterTaskKind =
  | "direct_chat"
  | "memory_update"
  | "cover_letter"
  | "application_email"
  | "resume_patch"
  | "mixed";

export type GhostwriterEvidenceSelectionPlan = {
  selectedModuleIds: string[];
  selectedModules: GhostwriterExperienceModule[];
  leadModuleId: string | null;
  supportModuleIds: string[];
  requiredEvidenceSnippets: string[];
  blockedClaims: string[];
  blockedEvidenceIds: string[];
  selectionRationale: string[];
  writerInstructions: string[];
};

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function buildLocalEvidenceSelectionPlan(args: {
  context: JobChatPromptContext;
  taskKind: GhostwriterTaskKind;
  prompt: string;
  preferredModuleIds?: string[];
  blockedClaims?: string[];
  blockedEvidenceIds?: string[];
  selectionRationale?: string[];
}): GhostwriterEvidenceSelectionPlan {
  const modules = args.context.evidencePack.experienceBank;
  const preferred = new Set((args.preferredModuleIds ?? []).filter(Boolean));
  const blockedEvidenceIds = new Set((args.blockedEvidenceIds ?? []).filter(Boolean));

  const ranked = [
    ...modules.filter((module) => preferred.has(module.id) && !blockedEvidenceIds.has(module.id)),
    ...modules.filter((module) => !preferred.has(module.id) && !blockedEvidenceIds.has(module.id)),
  ];

  const limit = args.taskKind === "resume_patch" ? 3 : 2;
  const selectedModules = ranked.slice(0, limit);
  const leadModule = selectedModules[0] ?? null;
  const supportModules = selectedModules.slice(1, 3);

  const requiredEvidenceSnippets = dedupe([
    ...selectedModules.flatMap((module) => [
      module.label,
      module.preferredFraming,
      ...module.strongestClaims.slice(0, 2),
    ]),
    ...args.context.evidencePack.topEvidence.slice(0, 2),
  ]).slice(0, 8);

  const blockedClaims = dedupe([
    ...(args.blockedClaims ?? []),
    ...args.context.evidencePack.forbiddenClaims,
    ...args.context.evidencePack.biggestGaps.map(
      (gap) => `Do not write around this weak area as if it were a strength: ${gap}`,
    ),
  ]).slice(0, 6);

  const selectionRationale = dedupe([
    ...(args.selectionRationale ?? []),
    leadModule
      ? `Lead with ${leadModule.label} because it is the strongest proof point for this job.`
      : "No strong proof point module was selected, so keep the draft narrower and more cautious.",
    ...supportModules.map(
      (module) => `${module.label} can support the main angle without changing the story direction.`,
    ),
  ]).slice(0, 4);

  const writerInstructions = dedupe([
    leadModule
      ? `Primary proof point: ${leadModule.label}. Build the draft around it before mentioning any weaker material.`
      : "Use the strongest directly supported evidence only.",
    supportModules.length
      ? `Only use these support modules if they reinforce the same angle: ${supportModules.map((module) => module.label).join(", ")}.`
      : "Do not pull in extra side projects unless they clearly strengthen the same role-fit angle.",
    `Allowed evidence ids: ${selectedModules.map((module) => module.id).join(", ") || "none"}. Avoid unselected modules unless the user explicitly asks for them.`,
    blockedClaims[0] ?? "Do not overclaim beyond the visible evidence.",
  ]).slice(0, 5);

  return {
    selectedModuleIds: selectedModules.map((module) => module.id),
    selectedModules,
    leadModuleId: leadModule?.id ?? null,
    supportModuleIds: supportModules.map((module) => module.id),
    requiredEvidenceSnippets,
    blockedClaims,
    blockedEvidenceIds: Array.from(blockedEvidenceIds),
    selectionRationale,
    writerInstructions,
  };
}
