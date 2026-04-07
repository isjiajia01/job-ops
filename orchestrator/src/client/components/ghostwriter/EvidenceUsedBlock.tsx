import type { CandidateKnowledgeProject } from "@shared/types";
import type React from "react";

type Props = {
  evidenceUsed: CandidateKnowledgeProject[];
};

export const EvidenceUsedBlock: React.FC<Props> = ({ evidenceUsed }) => {
  if (evidenceUsed.length === 0) return null;

  return (
    <div className="rounded-[22px] border border-emerald-200/80 bg-emerald-50/70 px-5 py-4 shadow-[0_10px_25px_rgba(60,140,110,0.08)] dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
        Evidence used
      </div>
      <div className="space-y-2">
        {evidenceUsed.map((project) => (
          <div
            key={project.id}
            className="rounded-xl border border-emerald-200/60 bg-white/80 px-3 py-2 dark:border-emerald-500/10 dark:bg-background/60"
          >
            <div className="text-sm font-medium text-stone-800 dark:text-foreground">
              {project.name}
            </div>
            <div className="mt-1 text-xs leading-6 text-stone-600 dark:text-muted-foreground">
              {project.summary}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
