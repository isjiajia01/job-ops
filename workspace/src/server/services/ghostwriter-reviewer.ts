import type {
  GhostwriterAssistantPayload,
  GhostwriterClaimPlan,
  GhostwriterDiagnostic,
} from "@shared/types";
import {
  buildDiagnostic,
  diagnosticFromIssueCode,
  normalizeDiagnostics,
} from "./ghostwriter-diagnostics";

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
  diagnostics: GhostwriterDiagnostic[];
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
      diagnostics: [
        buildDiagnostic({
          code: "empty-output",
          category: "quality",
          severity: "high",
          detail: "The model returned no substantive draft text.",
        }),
      ],
      shouldRewrite: false,
    };
  }

  const normalized = text.toLowerCase();
  const issues: string[] = [];
  const diagnostics: GhostwriterDiagnostic[] = [];

  const genericHits = countMatches(normalized, [
    /i am writing to express my interest/g,
    /i am excited to apply/g,
    /highly motivated/g,
    /perfect fit/g,
    /dynamic team/g,
    /fast-paced environment/g,
    /strong fit/g,
    /thrilled to/g,
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

  const sentences = text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const sentenceCount = sentences.length;
  const longSentenceCount = sentences.filter((sentence) => sentence.trim().length > 220).length;
  const averageSentenceLength =
    sentenceCount > 0
      ? sentences.reduce((total, sentence) => total + sentence.length, 0) / sentenceCount
      : 0;
  const repeatedOpeners = countMatches(normalized, [
    /^i /gm,
    /^this role/gm,
    /^the role/gm,
  ]);

  const groundedClaimResults = (args.claimPlan?.claims ?? []).map((claim) => {
    const claimSnippet = claim.claim.toLowerCase().slice(0, 36);
    const claimMatched = normalized.includes(claimSnippet);
    const evidenceMatched = claim.evidenceSnippets.some((item) => normalized.includes(item.toLowerCase().slice(0, 24)));
    return {
      claim,
      claimMatched,
      evidenceMatched,
      grounded: evidenceMatched && (claimMatched || claim.priority !== "must"),
    };
  });
  const coveredClaimCount = groundedClaimResults.filter((item) => item.grounded).length;
  const weaklyGroundedMustClaims = groundedClaimResults.filter(
    (item) => item.claim.priority === "must" && !item.grounded && (item.claimMatched || item.evidenceMatched),
  );
  const unsupportedMustClaims = groundedClaimResults.filter(
    (item) => item.claim.priority === "must" && !item.claimMatched && !item.evidenceMatched,
  );

  const roleSpecificBoost =
    args.roleFamily === "planning-and-operations"
      ? countMatches(normalized, [/planning/g, /operational/g, /constraints/g, /decision support/g]) * 0.15
      : args.roleFamily === "analytics-and-decision-support"
        ? countMatches(normalized, [/analysis/g, /python/g, /excel/g, /reporting/g]) * 0.15
        : args.roleFamily === "optimization-and-research"
          ? countMatches(normalized, [/optimization/g, /rolling-horizon/g, /model/g, /routing/g]) * 0.15
          : 0;

  const specificity = clamp(
    2 +
      concreteEvidenceHits * 0.6 +
      coveredClaimCount * 0.65 +
      roleSpecificBoost -
      genericHits * 0.5 -
      weaklyGroundedMustClaims.length * 0.5 -
      unsupportedMustClaims.length * 0.7,
  );
  const evidenceStrength = clamp(
    2 +
      concreteEvidenceHits * 0.6 +
      coveredClaimCount * 0.8 +
      roleSpecificBoost -
      overclaimHits * 0.4 -
      weaklyGroundedMustClaims.length * 0.7 -
      unsupportedMustClaims.length,
  );
  const overclaimRisk = clamp(4 - overclaimHits * 0.8 - genericHits * 0.2);
  const naturalness = clamp(
    3 -
      genericHits * 0.55 -
      longSentenceCount * 0.45 -
      (averageSentenceLength > 165 ? 0.7 : 0) -
      (repeatedOpeners > 2 ? 0.5 : 0) +
      Math.min(sentenceCount, 4) * 0.1 +
      roleSpecificBoost * 0.2,
  );

  if (genericHits > 0) {
    const code = `generic-language:${genericHits}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (overclaimHits > 0) {
    const code = `overclaim-risk:${overclaimHits}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (longSentenceCount > 0) {
    const code = `long-sentences:${longSentenceCount}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (averageSentenceLength > 165) {
    const code = "dense-sentence-flow";
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (repeatedOpeners > 2) {
    const code = `repetitive-openers:${repeatedOpeners}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (coveredClaimCount === 0 && args.claimPlan?.claims.length) {
    const code = "weak-claim-coverage";
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (weaklyGroundedMustClaims.length > 0) {
    const code = `weakly-grounded-claim:${weaklyGroundedMustClaims[0]?.claim.id ?? "must"}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (unsupportedMustClaims.length > 0) {
    const code = `unsupported-claim:${unsupportedMustClaims[0]?.claim.id ?? "must"}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (concreteEvidenceHits < 2) {
    const code = "thin-evidence-signal";
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }
  if (args.roleFamily && roleSpecificBoost < 0.2) {
    const code = `weak-role-rubric:${args.roleFamily}`;
    issues.push(code);
    diagnostics.push(diagnosticFromIssueCode(code));
  }

  const shouldRewrite =
    specificity <= 2 ||
    evidenceStrength <= 2 ||
    naturalness <= 2 ||
    overclaimRisk <= 2 ||
    issues.includes("weak-claim-coverage") ||
    issues.some((issue) => issue.startsWith("unsupported-claim:")) ||
    issues.some((issue) => issue.startsWith("weakly-grounded-claim:"));

  return {
    summary: `Specificity ${specificity}/5 · Evidence ${evidenceStrength}/5 · Overclaim risk ${overclaimRisk}/5 · Naturalness ${naturalness}/5`,
    scores: {
      specificity,
      evidenceStrength,
      overclaimRisk,
      naturalness,
    },
    issues,
    diagnostics: normalizeDiagnostics(diagnostics),
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
