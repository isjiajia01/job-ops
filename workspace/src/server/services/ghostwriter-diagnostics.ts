import type { GhostwriterDiagnostic } from "@shared/types";

const severityRank: Record<GhostwriterDiagnostic["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function buildDiagnostic(input: GhostwriterDiagnostic): GhostwriterDiagnostic {
  return input;
}

export function normalizeDiagnostics(
  diagnostics: GhostwriterDiagnostic[],
): GhostwriterDiagnostic[] {
  const byCode = new Map<string, GhostwriterDiagnostic>();
  for (const diagnostic of diagnostics) {
    const existing = byCode.get(diagnostic.code);
    if (!existing) {
      byCode.set(diagnostic.code, diagnostic);
      continue;
    }
    byCode.set(
      diagnostic.code,
      severityRank[diagnostic.severity] > severityRank[existing.severity]
        ? diagnostic
        : existing,
    );
  }
  return Array.from(byCode.values()).sort((left, right) => {
    const severityDelta = severityRank[right.severity] - severityRank[left.severity];
    if (severityDelta !== 0) return severityDelta;
    return left.code.localeCompare(right.code);
  });
}

export function diagnosticsFromIssueCodes(codes: string[]): GhostwriterDiagnostic[] {
  return normalizeDiagnostics(codes.map((code) => diagnosticFromIssueCode(code)));
}

export function summarizeDiagnostics(
  diagnostics: GhostwriterDiagnostic[],
): Array<{ category: GhostwriterDiagnostic["category"]; severity: GhostwriterDiagnostic["severity"]; count: number }> {
  const counts = new Map<string, { category: GhostwriterDiagnostic["category"]; severity: GhostwriterDiagnostic["severity"]; count: number }>();
  for (const diagnostic of normalizeDiagnostics(diagnostics)) {
    const key = `${diagnostic.category}:${diagnostic.severity}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, {
      category: diagnostic.category,
      severity: diagnostic.severity,
      count: 1,
    });
  }
  return Array.from(counts.values()).sort((left, right) => {
    const severityDelta = severityRank[right.severity] - severityRank[left.severity];
    if (severityDelta !== 0) return severityDelta;
    return left.category.localeCompare(right.category);
  });
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
