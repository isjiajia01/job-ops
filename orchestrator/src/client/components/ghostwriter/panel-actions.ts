import type { DocumentStrategy } from "@shared/types";

export type GhostwriterQuickAction = {
  label: string;
  prompt: string;
};

export function buildGhostwriterQuickActions(
  documentStrategy: DocumentStrategy | null,
): GhostwriterQuickAction[] {
  const actions: GhostwriterQuickAction[] = [
    {
      label: "Cover letter",
      prompt:
        "Draft a tailored cover letter for this job using the current strategy. Keep it concrete, specific, and aligned with the strongest evidence.",
    },
    {
      label: "Rewrite CV",
      prompt:
        "Rewrite the current tailored CV draft for this job around the current strategy. Strengthen the summary, headline, and skills without inventing experience.",
    },
    {
      label: "Fit brief",
      prompt:
        "Summarize the strongest fit evidence, main weak points, and the best application angle for this role.",
    },
  ];

  if (!documentStrategy) return actions;

  return actions.map((action, index) => ({
    ...action,
    prompt:
      index < 2
        ? `${action.prompt}\n\nUse the current saved job strategy as the organizing frame.`
        : action.prompt,
  }));
}

export function buildGhostwriterSuggestedPrompts(): GhostwriterQuickAction[] {
  return [
    {
      label: "Draft cover letter",
      prompt:
        "Draft a tailored cover letter for this job. Keep it specific, evidence-backed, and under 300 words.",
    },
    {
      label: "Rewrite CV around fit",
      prompt:
        "Rewrite the current tailored CV draft so it matches this role more sharply while staying fully truthful.",
    },
    {
      label: "Show strongest evidence",
      prompt:
        "What are the strongest pieces of evidence from my profile for this role, and what angle should the application take?",
    },
  ];
}
