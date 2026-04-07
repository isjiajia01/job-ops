import type { GhostwriterAssistantPayload, GhostwriterClaimPlan } from "@shared/types";

export type GhostwriterReviewScores = {
  specificity: number;
  evidenceStrength: number;
  overclaimRisk: number;
  naturalness: number;
};

export type GhostwriterReviewResult = {
  summary: string;
  scores: GhostwriterReviewScores;
  issues: string[];
  shouldRewrite: boolean;
};

function clamp(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (text.match(pattern)?.length ?? 0), 0);
}

export function reviewGhostwriterPayload(args: {
  payload: GhostwriterAssistantPayload;
  claimPlan?: GhostwriterClaimPlan | null;
  roleFamily?: string | null;
}): GhostwriterReviewResult {
  const text = [args.payload.response, args.payload.coverLetterDraft]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) {
    return {
      summary: "No substantive text to review.",
      scores: {
        specificity: 1,
        evidenceStrength: 1,
        overclaimRisk: 3,
        naturalness: 1,
      },
      issues: ["empty-output"],
      shouldRewrite: false,
    };
  }

  const normalized = text.toLowerCase();
  const issues: string[] = [];

  const genericHits = countMatches(normalized, [
    /i am writing to express my interest/g,
    /i am excited to apply/g,
    /highly motivated/g,
    /perfect fit/g,
    /dynamic team/g,
    /fast-paced environment/g,
  ]);

  const overclaimHits = countMatches(normalized, [
    /enterprise-wide/g,
    /global/g,
    /10\+ years/g,
    /industry-leading/g,
    /head of/g,
    /director/g,
  ]);

  const concreteEvidenceHits = countMatches(normalized, [
    /dtu/g,
    /mover/g,
    /planning/g,
    /rolling-horizon/g,
    /delivery constraints/g,
    /decision support/g,
    /python/g,
    /excel/g,
  ]);

  const sentenceCount = text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean).length;
  const longSentenceCount = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim().length > 220).length;

  const coveredClaimCount = args.claimPlan?.claims.filter((claim) => {
    const claimSnippet = claim.claim.toLowerCase().slice(0, 36);
    return normalized.includes(claimSnippet) || claim.evidenceSnippets.some((item) => normalized.includes(item.toLowerCase().slice(0, 24)));
  }).length ?? 0;

  const roleSpecificBoost =
    args.roleFamily === "planning-and-operations"
      ? countMatches(normalized, [/planning/g, /operational/g, /constraints/g, /decision support/g]) * 0.15
      : args.roleFamily === "analytics-and-decision-support"
        ? countMatches(normalized, [/analysis/g, /python/g, /excel/g, /reporting/g]) * 0.15
        : args.roleFamily === "optimization-and-research"
          ? countMatches(normalized, [/optimization/g, /rolling-horizon/g, /model/g, /routing/g]) * 0.15
          : 0;

  const specificity = clamp(2 + concreteEvidenceHits * 0.6 + coveredClaimCount * 0.5 + roleSpecificBoost - genericHits * 0.5);
  const evidenceStrength = clamp(2 + concreteEvidenceHits * 0.6 + coveredClaimCount * 0.6 + roleSpecificBoost - overclaimHits * 0.4);
  const overclaimRisk = clamp(4 - overclaimHits * 0.8 - genericHits * 0.2);
  const naturalness = clamp(3 - genericHits * 0.5 - longSentenceCount * 0.4 + Math.min(sentenceCount, 4) * 0.1 + roleSpecificBoost * 0.2);

  if (genericHits > 0) issues.push(`generic-language:${genericHits}`);
  if (overclaimHits > 0) issues.push(`overclaim-risk:${overclaimHits}`);
  if (longSentenceCount > 0) issues.push(`long-sentences:${longSentenceCount}`);
  if (coveredClaimCount === 0 && args.claimPlan?.claims.length) issues.push("weak-claim-coverage");
  if (concreteEvidenceHits < 2) issues.push("thin-evidence-signal");
  if (args.roleFamily && roleSpecificBoost < 0.2) issues.push(`weak-role-rubric:${args.roleFamily}`);

  const shouldRewrite =
    specificity <= 2 ||
    evidenceStrength <= 2 ||
    naturalness <= 2 ||
    overclaimRisk <= 2 ||
    issues.includes("weak-claim-coverage");

  return {
    summary: `Specificity ${specificity}/5 · Evidence ${evidenceStrength}/5 · Overclaim risk ${overclaimRisk}/5 · Naturalness ${naturalness}/5`,
    scores: {
      specificity,
      evidenceStrength,
      overclaimRisk,
      naturalness,
    },
    issues,
    shouldRewrite,
  };
}

export function buildReviewerRewritePrompt(args: {
  payload: GhostwriterAssistantPayload;
  review: GhostwriterReviewResult;
  claimPlan?: GhostwriterClaimPlan | null;
}): string {
  return [
    "You are a post-generation reviewer and rewrite judge for Ghostwriter.",
    "The draft needs one more rewrite pass.",
    `Review summary: ${args.review.summary}`,
    `Issues: ${args.review.issues.join(", ") || "tighten the draft"}`,
    args.claimPlan
      ? `Claims that must remain covered: ${args.claimPlan.claims.map((claim) => `${claim.priority}:${claim.claim}`).join(" | ")}`
      : null,
    args.claimPlan?.excludedClaims?.length
      ? `Still avoid: ${args.claimPlan.excludedClaims.join(" | ")}`
      : null,
    "Rewrite goals:",
    "- increase specificity with existing evidence only",
    "- strengthen evidence-to-claim grounding",
    "- reduce overclaiming or inflated tone",
    "- make the writing sound more natural and less templated",
    "Do not add any unsupported facts.",
    "Return the same JSON response contract with improved wording only.",
    `Current payload JSON:\n${JSON.stringify(args.payload, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
