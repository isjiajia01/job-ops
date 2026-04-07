import type { GhostwriterAssistantPayload, GhostwriterClaimPlan } from "@shared/types";

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (count, pattern) => count + (text.match(pattern)?.length ?? 0),
    0,
  );
}

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
    /strong fit/,
    /thrilled to/,
  ];

  const genericHits = genericPatterns.filter((pattern) => pattern.test(normalized)).length;
  if (genericHits > 0) reasons.push(`generic-phrases:${genericHits}`);

  const sentences = text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const longSentenceCount = sentences.filter((sentence) => sentence.length > 220).length;
  const averageSentenceLength =
    sentences.length > 0
      ? sentences.reduce((total, sentence) => total + sentence.length, 0) / sentences.length
      : 0;
  if (longSentenceCount > 0) reasons.push(`long-sentences:${longSentenceCount}`);
  if (averageSentenceLength > 165) reasons.push("dense-sentence-flow");

  const firstParagraph = text.split(/\n\s*\n/)[0]?.toLowerCase() ?? "";
  if (
    firstParagraph.startsWith("i am") ||
    firstParagraph.startsWith("dear hiring") ||
    firstParagraph.includes("excited to apply")
  ) {
    reasons.push("generic-opening");
  }

  const repeatedOpeners = ["i ", "this role", "the role"].reduce(
    (count, prefix) =>
      count +
      sentences.filter((sentence) => sentence.toLowerCase().startsWith(prefix)).length,
    0,
  );
  if (repeatedOpeners > 2) reasons.push(`repetitive-openers:${repeatedOpeners}`);

  const fitPhrases = countMatches(normalized, [
    /fit for the role/g,
    /fit for this role/g,
    /fit with the role/g,
    /background in/g,
    /opportunity to contribute/g,
  ]);
  if (fitPhrases > 3) reasons.push(`overpacked-fit-language:${fitPhrases}`);

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
    "You are an editorial sharpener running a dedicated anti-AI rewrite pass. Rewrite the draft so it sounds less like a polished assistant and more like a thoughtful human applicant.",
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
    "- break up dense or over-smoothed sentence flow",
    "- reduce repeated sentence openings and repetitive fit signalling",
    "- prefer concrete operational wording over abstract enthusiasm",
    "- keep the user's voice restrained, practical, and slightly plain where useful",
    "- do not make every sentence sound maximally polished; a little natural roughness is better than AI slickness",
    "Return the same JSON response contract, only with stronger wording.",
    `Current payload JSON:\n${JSON.stringify(args.original, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
