import type { CandidateKnowledgeProject, DocumentStrategy } from "@shared/types";
import type React from "react";

type WritingContextPreviewProps = {
  documentStrategy: DocumentStrategy | null;
  selectedProofPoints: CandidateKnowledgeProject[];
  onUseProofPointsInPrompt: () => void;
};

export const WritingContextPreview: React.FC<WritingContextPreviewProps> = ({
  documentStrategy,
  selectedProofPoints,
  onUseProofPointsInPrompt,
}) => {
  if (!documentStrategy && selectedProofPoints.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Writing context preview
      </div>
      {documentStrategy ? (
        <>
          <div>
            <div className="font-medium text-foreground/90">Role angle</div>
            <div className="mt-1 text-muted-foreground">
              {documentStrategy.roleAngle}
            </div>
          </div>
          <div>
            <div className="font-medium text-foreground/90">Strongest evidence</div>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
              {documentStrategy.strongestEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-medium text-foreground/90">Cover letter angle</div>
            <div className="mt-1 text-muted-foreground">
              {documentStrategy.coverLetterAngle}
            </div>
          </div>
        </>
      ) : null}

      {selectedProofPoints.length > 0 ? (
        <div className="space-y-2 rounded-md border border-emerald-200/70 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-foreground/90">
              Selected proof points for this job
            </div>
            <button
              type="button"
              onClick={onUseProofPointsInPrompt}
              className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition hover:bg-muted/50"
            >
              Use in prompt
            </button>
          </div>
          <div className="space-y-2">
            {selectedProofPoints.map((project) => (
              <div
                key={project.id}
                className="rounded-md border border-border/50 bg-background/70 p-2.5"
              >
                <div className="font-medium text-foreground/90">{project.name}</div>
                <div className="mt-1 text-muted-foreground">{project.summary}</div>
                {project.impact ? (
                  <div className="mt-1 text-muted-foreground">
                    Impact: {project.impact}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 bg-background/60 p-3 text-muted-foreground">
          No proof points are selected for this job yet. Pick them from the recommended proof points section on the job page to make Ghostwriter more grounded.
        </div>
      )}
    </div>
  );
};
