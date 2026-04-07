import type { GhostwriterClaimPlan, GhostwriterClaimPlanItem } from "@shared/types";
import type { GhostwriterEvidenceSelectionPlan } from "./ghostwriter-evidence-selector";
import type { GhostwriterEvidencePack, JobChatPromptContext } from "./ghostwriter-context";

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

function compact<T>(items: Array<T | null | undefined | false>): T[] {
  return items.filter(Boolean) as T[];
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildEvidenceHints(evidencePack: GhostwriterEvidencePack): string[] {
  return dedupe([
    ...evidencePack.selectedNarrative,
    ...evidencePack.topEvidence,
    ...evidencePack.topFitReasons,
    ...evidencePack.evidenceStory,
    ...evidencePack.experienceBank.flatMap((module) => [
      module.label,
      module.preferredFraming,
      ...module.strongestClaims,
      ...module.supportSignals,
    ]),
  ]).slice(0, 12);
}

function buildClaimItem(args: {
  id: string;
  claim: string;
  jdRequirement?: string | null;
  evidenceSnippets: string[];
  priority: GhostwriterClaimPlanItem["priority"];
  riskLevel: GhostwriterClaimPlanItem["riskLevel"];
  guidance?: string | null;
  context: JobChatPromptContext;
}): GhostwriterClaimPlanItem {
  const evidenceIds = args.context.evidencePack.experienceBank
    .filter((module) => {
      const haystack = normalize([
        module.label,
        module.preferredFraming,
        ...module.strongestClaims,
        ...module.supportSignals,
      ].join(" "));
      return args.evidenceSnippets.some((snippet) => {
        const needle = normalize(snippet);
        return needle && haystack.includes(needle.slice(0, Math.min(needle.length, 48)));
      });
    })
    .map((module) => module.id)
    .slice(0, 3);

  return {
    id: args.id,
    claim: args.claim,
    jdRequirement: args.jdRequirement ?? null,
    evidenceIds,
    evidenceSnippets: dedupe(args.evidenceSnippets).slice(0, 3),
    priority: args.priority,
    riskLevel: args.riskLevel,
    guidance: args.guidance ?? null,
  };
}

export function buildGhostwriterClaimPlan(args: {
  context: JobChatPromptContext;
  prompt: string;
  taskKind: GhostwriterTaskKind;
  strategy: WritingStrategy;
  evidenceSelection?: GhostwriterEvidenceSelectionPlan | null;
}): GhostwriterClaimPlan {
  const { context, strategy, taskKind } = args;
  const { evidencePack } = context;
  const evidenceHints = buildEvidenceHints(evidencePack);
  const topModules = args.evidenceSelection?.selectedModules?.length
    ? args.evidenceSelection.selectedModules.slice(0, 3)
    : evidencePack.experienceBank.slice(0, 3);
  const claims: GhostwriterClaimPlanItem[] = [];

  claims.push(
    buildClaimItem({
      id: "claim-role-fit",
      claim: strategy.angle || evidencePack.recommendedAngle || "Position the candidate around the strongest role-fit angle.",
      jdRequirement: evidencePack.targetRoleSummary || null,
      evidenceSnippets: compact([
        evidencePack.topFitReasons[0],
        evidencePack.topEvidence[0],
        topModules[0]?.preferredFraming,
      ]),
      priority: "must",
      riskLevel: "low",
      guidance: "Lead the draft with the clearest job-relevant angle instead of generic motivation language.",
      context,
    }),
  );

  if (topModules[0]) {
    claims.push(
      buildClaimItem({
        id: `claim-module-${topModules[0].id}`,
        claim: `Use ${topModules[0].label} as the lead proof point for this role.`,
        jdRequirement: evidencePack.topFitReasons[1] ?? evidencePack.targetRoleFamily,
        evidenceSnippets: compact([
          topModules[0].preferredFraming,
          topModules[0].strongestClaims[0],
          topModules[0].supportSignals[0],
        ]),
        priority: "must",
        riskLevel: "low",
        guidance: "Turn the lead module into a concrete, recruiter-facing fit claim.",
        context,
      }),
    );
  }

  if (topModules[1]) {
    claims.push(
      buildClaimItem({
        id: `claim-module-${topModules[1].id}`,
        claim: `Support the role fit with ${topModules[1].label} as secondary evidence.`,
        jdRequirement: evidencePack.topFitReasons[2] ?? null,
        evidenceSnippets: compact([
          topModules[1].preferredFraming,
          topModules[1].strongestClaims[0],
          topModules[1].supportSignals[0],
        ]),
        priority: taskKind === "resume_patch" ? "high" : "medium",
        riskLevel: "low",
        guidance: "Use a second proof point only if it sharpens the main angle.",
        context,
      }),
    );
  }

  if (evidencePack.biggestGaps[0]) {
    claims.push(
      buildClaimItem({
        id: "claim-gap-management",
        claim: `Acknowledge or route around the main watchout: ${evidencePack.biggestGaps[0]}`,
        jdRequirement: null,
        evidenceSnippets: compact([
          evidencePack.topEvidence[0],
          evidencePack.selectedNarrative[0],
        ]),
        priority: "high",
        riskLevel: "medium",
        guidance: "Do not overcompensate for weak areas; keep the writing modest and evidence-first.",
        context,
      }),
    );
  }

  const excludedClaims = dedupe([
    ...(args.evidenceSelection?.blockedClaims ?? []),
    ...evidencePack.forbiddenClaims,
    ...evidencePack.biggestGaps.map((gap) => `Do not overstate ${gap}`),
  ]).slice(0, 6);

  const reviewerFocus = dedupe([
    "Check that every major paragraph maps to at least one prioritized claim.",
    "Penalize generic openings that do not carry job-specific evidence.",
    "Prefer variants that cover must-claims with stronger evidence density.",
    ...(args.evidenceSelection?.writerInstructions ?? []).slice(0, 2),
    ...strategy.paragraphPlan.slice(0, 2),
    ...excludedClaims.slice(0, 2).map((item) => `Avoid: ${item}`),
  ]).slice(0, 7);

  return {
    targetRoleAngle: strategy.angle || evidencePack.recommendedAngle || evidenceHints[0] || "Evidence-backed fit angle",
    openingStrategy:
      taskKind === "application_email"
        ? "Open with a direct work-focused note, then move immediately into the strongest evidence-backed fit reasons."
        : "Open from the role's work, planning problem, or operating need and anchor it in the lead proof point.",
    claims: claims.slice(0, 4),
    excludedClaims,
    reviewerFocus,
  };
}
