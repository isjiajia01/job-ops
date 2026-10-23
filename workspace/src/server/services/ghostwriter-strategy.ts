import type { JsonSchemaDefinition } from "./llm/types";
import type { GhostwriterEvidencePack } from "./ghostwriter-context";

type GhostwriterTaskKind =
  | "direct_chat"
  | "memory_update"
  | "cover_letter"
  | "application_email"
  | "resume_patch"
  | "mixed";

export type WritingStrategy = {
  angle: string;
  strongestEvidence: string[];
  weakPoints: string[];
  paragraphPlan: string[];
  tonePlan: string;
  requiresClarification: boolean;
  clarifyingQuestions: string[];
};

export const WRITING_STRATEGY_SCHEMA: JsonSchemaDefinition = {
  name: "job_chat_writing_strategy",
  schema: {
    type: "object",
    properties: {
      angle: { type: "string" },
      strongestEvidence: { type: "array", items: { type: "string" } },
      weakPoints: { type: "array", items: { type: "string" } },
      paragraphPlan: { type: "array", items: { type: "string" } },
      tonePlan: { type: "string" },
      requiresClarification: { type: "boolean" },
      clarifyingQuestions: { type: "array", items: { type: "string" } },
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

export function buildLocalWritingStrategy(args: {
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

export function buildStrategySnapshot(strategy: WritingStrategy): string {
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
