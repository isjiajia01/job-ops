import type { GhostwriterDiagnostic } from "@shared/types";

export function buildDiagnostic(input: GhostwriterDiagnostic): GhostwriterDiagnostic {
  return input;
}

export function diagnosticsFromIssueCodes(codes: string[]): GhostwriterDiagnostic[] {
  return codes.map((code) => diagnosticFromIssueCode(code));
}

export function diagnosticFromIssueCode(code: string): GhostwriterDiagnostic {
  if (code.startsWith("generic-language:") || code.startsWith("generic-phrases:")) {
    return buildDiagnostic({
      code,
      category: "generic-language",
      severity: numericSuffix(code) >= 3 ? "high" : "medium",
      detail: "The draft still contains template-like application language.",
    });
  }
  if (code.startsWith("overclaim-risk:")) {
    return buildDiagnostic({
      code,
      category: "overclaim",
      severity: numericSuffix(code) >= 2 ? "high" : "medium",
      detail: "Some wording implies unsupported scope, seniority, or ownership.",
    });
  }
  if (code.startsWith("long-sentences:")) {
    return buildDiagnostic({
      code,
      category: "structure",
      severity: numericSuffix(code) >= 2 ? "high" : "medium",
      detail: "One or more sentences are too long and reduce clarity.",
    });
  }
  if (code === "dense-sentence-flow") {
    return buildDiagnostic({
      code,
      category: "style",
      severity: "medium",
      detail: "Sentence flow is too dense and over-smoothed.",
    });
  }
  if (code.startsWith("repetitive-openers:")) {
    return buildDiagnostic({
      code,
      category: "style",
      severity: "medium",
      detail: "Too many sentences start with the same opener pattern.",
    });
  }
  if (code === "weak-claim-coverage") {
    return buildDiagnostic({
      code,
      category: "claim-coverage",
      severity: "high",
      detail: "The final draft does not clearly cover the planned must-claims.",
    });
  }
  if (code === "thin-evidence-signal") {
    return buildDiagnostic({
      code,
      category: "claim-coverage",
      severity: "medium",
      detail: "The draft does not surface enough concrete evidence.",
    });
  }
  if (code.startsWith("weak-role-rubric:")) {
    return buildDiagnostic({
      code,
      category: "role-fit",
      severity: "medium",
      detail: "Role-specific wording is weaker than expected for the selected role family.",
    });
  }
  if (code === "high-risk-language") {
    return buildDiagnostic({
      code,
      category: "overclaim",
      severity: "high",
      detail: "The draft uses language that implies unsupported scope or certainty.",
    });
  }
  if (code.startsWith("missed-must-claim:")) {
    return buildDiagnostic({
      code,
      category: "claim-coverage",
      severity: "high",
      detail: "A must-claim from the plan is not reflected in the final draft.",
    });
  }
  if (code.startsWith("excluded-claim:")) {
    return buildDiagnostic({
      code,
      category: "evidence-boundary",
      severity: "high",
      detail: "The draft appears to reuse a claim that was explicitly excluded.",
    });
  }
  if (code.startsWith("unapproved-evidence-ids:")) {
    return buildDiagnostic({
      code,
      category: "evidence-boundary",
      severity: "high",
      detail: "Some claims reference evidence modules outside the approved selection.",
    });
  }
  if (code.startsWith("possible-unapproved-projects:")) {
    return buildDiagnostic({
      code,
      category: "evidence-boundary",
      severity: "medium",
      detail: "The draft mentions project labels that were not part of the approved evidence set.",
    });
  }
  if (code === "generic-opening") {
    return buildDiagnostic({
      code,
      category: "generic-language",
      severity: "high",
      detail: "The opening still sounds template-like instead of work-led.",
    });
  }
  if (code.startsWith("overpacked-fit-language:")) {
    return buildDiagnostic({
      code,
      category: "style",
      severity: "medium",
      detail: "Too many sentences explicitly signal fit instead of letting evidence carry the case.",
    });
  }

  return buildDiagnostic({
    code,
    category: "quality",
    severity: "medium",
    detail: `Ghostwriter flagged ${code}.`,
  });
}

function numericSuffix(code: string): number {
  const match = code.match(/:(\d+)$/);
  return match ? Number(match[1]) : 0;
}
