import type { GhostwriterAssistantPayload, GhostwriterClaimPlan } from "@shared/types";

export function shouldRunEditorialRewrite(payload: GhostwriterAssistantPayload): {
  shouldRewrite: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const text = [payload.response, payload.coverLetterDraft].filter(Boolean).join("\n\n").trim();
  if (!text) return { shouldRewrite: false, reasons };

  const normalized = text.toLowerCase();
  const genericPatterns = [
    /i am writing to express my interest/,
    /i am excited to apply/,
    /highly motivated/,
    /perfect fit/,
    /passionate about/,
    /dynamic team/,
    /fast-paced environment/,
  ];

  const genericHits = genericPatterns.filter((pattern) => pattern.test(normalized)).length;
  if (genericHits > 0) reasons.push(`generic-phrases:${genericHits}`);

  const sentences = text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const longSentenceCount = sentences.filter((sentence) => sentence.length > 220).length;
  if (longSentenceCount > 0) reasons.push(`long-sentences:${longSentenceCount}`);

  const firstParagraph = text.split(/\n\s*\n/)[0]?.toLowerCase() ?? "";
  if (
    firstParagraph.startsWith("i am") ||
    firstParagraph.startsWith("dear hiring") ||
    firstParagraph.includes("excited to apply")
  ) {
    reasons.push("generic-opening");
  }

  return {
    shouldRewrite: reasons.length > 0,
    reasons,
  };
}

export function buildEditorialRewritePrompt(args: {
  original: GhostwriterAssistantPayload;
  claimPlan: GhostwriterClaimPlan | null | undefined;
  triggerReasons: string[];
}): string {
  const artifactType = args.original.coverLetterDraft
    ? args.original.coverLetterKind === "email"
      ? "application email"
      : "cover letter"
    : args.original.resumePatch
      ? "resume-tailoring response"
      : "direct response";

  return [
    `Artifact type: ${artifactType}`,
    `Rewrite triggers: ${args.triggerReasons.join(", ") || "make the writing tighter and less generic"}`,
    "You are an editorial sharpener. Rewrite the draft to sound less generic, more concrete, and more employer-need-driven.",
    "Do not add facts, metrics, tools, stakeholders, or ownership that are not already supported.",
    "Do not change the underlying output mode or structured fields unless necessary to make the existing response cleaner.",
    "Preserve the strongest claim coverage and keep the same main evidence base.",
    args.claimPlan
      ? `Prioritized claims to preserve: ${args.claimPlan.claims
          .map((claim) => `${claim.priority}:${claim.claim}`)
          .join(" | ")}`
      : null,
    args.claimPlan?.excludedClaims?.length
      ? `Still avoid these claims: ${args.claimPlan.excludedClaims.join(" | ")}`
      : null,
    "Focus on these edits:",
    "- remove stock motivation language",
    "- tighten long sentences",
    "- prefer concrete operational wording over abstract enthusiasm",
    "- keep the user's voice restrained and practical",
    "Return the same JSON response contract, only with stronger wording.",
    `Current payload JSON:\n${JSON.stringify(args.original, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
