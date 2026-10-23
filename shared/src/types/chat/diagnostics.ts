export interface GhostwriterDiagnostic {
  code: string;
  category:
    | "generic-language"
    | "structure"
    | "claim-coverage"
    | "evidence-boundary"
    | "overclaim"
    | "role-fit"
    | "style"
    | "quality";
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface GhostwriterDiagnosticSummaryItem {
  category: GhostwriterDiagnostic["category"];
  severity: GhostwriterDiagnostic["severity"];
  count: number;
}
