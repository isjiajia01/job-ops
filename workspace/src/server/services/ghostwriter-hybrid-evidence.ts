import type { JsonSchemaDefinition } from "./llm/types";
import type { LlmService } from "./llm/service";
import type { buildJobChatPromptContext } from "./ghostwriter-context";
import {
  buildLocalEvidenceSelectionPlan,
  type GhostwriterEvidenceSelectionPlan,
} from "./ghostwriter-evidence-selector";

export const EVIDENCE_SELECTION_SCHEMA: JsonSchemaDefinition = {
  name: "job_chat_evidence_selection",
  schema: {
    type: "object",
    properties: {
      selectedModuleIds: { type: "array", items: { type: "string" } },
      blockedClaims: { type: "array", items: { type: "string" } },
      selectionRationale: { type: "array", items: { type: "string" } },
      naturalnessNotes: { type: "array", items: { type: "string" } },
    },
    required: ["selectedModuleIds", "blockedClaims", "selectionRationale", "naturalnessNotes"],
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

type GhostwriterRunContext = Awaited<ReturnType<typeof buildJobChatPromptContext>>;
type LlmRuntimeSettings = {
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

export async function buildHybridEvidenceSelection(args: {
  llm: LlmService;
  llmConfig: LlmRuntimeSettings;
  context: GhostwriterRunContext;
  prompt: string;
  taskKind: GhostwriterTaskKind;
  jobId: string;
  signal: AbortSignal;
}): Promise<GhostwriterEvidenceSelectionPlan> {
  const localPlan = buildLocalEvidenceSelectionPlan({
    context: args.context,
    taskKind: args.taskKind,
    prompt: args.prompt,
  });

  if (localPlan.selectedModules.length === 0) return localPlan;

  const moduleOptions = localPlan.selectedModules
    .concat(
      args.context.evidencePack.experienceBank
        .filter((module) => !localPlan.selectedModuleIds.includes(module.id))
        .slice(0, 2),
    )
    .slice(0, 5)
    .map((module) => ({
      id: module.id,
      label: module.label,
      framing: module.preferredFraming,
      strongestClaims: module.strongestClaims.slice(0, 2),
    }));

  const result = await args.llm.callJson<{
    selectedModuleIds: string[];
    blockedClaims: string[];
    selectionRationale: string[];
    naturalnessNotes: string[];
  }>({
    model: args.llmConfig.model,
    messages: [
      {
        role: "system",
        content:
          "Approve a compact evidence set for an application-writing agent. Prefer 1 lead proof point and at most 1-2 support modules. Optimize for specificity, truthfulness, and natural writing. Return JSON only.",
      },
      {
        role: "user",
        content: [
          `Task kind: ${args.taskKind}`,
          `User request: ${args.prompt}`,
          `Role summary: ${args.context.evidencePack.targetRoleSummary}`,
          `Recommended angle: ${args.context.evidencePack.recommendedAngle}`,
          `Candidate modules: ${JSON.stringify(moduleOptions, null, 2)}`,
          `Current forbidden claims: ${args.context.evidencePack.forbiddenClaims.join(" | ")}`,
          "Select the smallest convincing evidence set. Also add any blocked claims that would make the writing sound inflated or unnatural.",
        ].join("\n\n"),
      },
    ],
    jsonSchema: EVIDENCE_SELECTION_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 300,
    jobId: args.jobId,
    signal: args.signal,
  });

  if (!result.success) return localPlan;

  const selectedModuleIds = Array.isArray(result.data.selectedModuleIds)
    ? result.data.selectedModuleIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const blockedClaims = Array.isArray(result.data.blockedClaims)
    ? result.data.blockedClaims.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const selectionRationale = Array.isArray(result.data.selectionRationale)
    ? result.data.selectionRationale.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const naturalnessNotes = Array.isArray(result.data.naturalnessNotes)
    ? result.data.naturalnessNotes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const approvedIds = new Set(
    selectedModuleIds.filter(
      (id) =>
        localPlan.selectedModules.some((module) => module.id === id) ||
        args.context.evidencePack.experienceBank.some((module) => module.id === id),
    ),
  );
  const selectedModules = args.context.evidencePack.experienceBank.filter((module) => approvedIds.has(module.id));
  const nextSelectedModules = selectedModules.length
    ? selectedModules.slice(0, args.taskKind === "resume_patch" ? 3 : 2)
    : localPlan.selectedModules;

  return {
    ...localPlan,
    selectedModules: nextSelectedModules,
    selectedModuleIds: nextSelectedModules.map((module) => module.id),
    leadModuleId: nextSelectedModules[0]?.id ?? localPlan.leadModuleId,
    supportModuleIds: nextSelectedModules.slice(1).map((module) => module.id),
    blockedClaims: Array.from(new Set([...localPlan.blockedClaims, ...blockedClaims])).slice(0, 8),
    selectionRationale: Array.from(
      new Set([...selectionRationale, ...naturalnessNotes, ...localPlan.selectionRationale]),
    ).slice(0, 6),
    writerInstructions: Array.from(new Set([...localPlan.writerInstructions, ...naturalnessNotes])).slice(0, 6),
  };
}
