import type { Job } from "@shared/types.js";
import { AlertTriangle, Sparkles, Target } from "lucide-react";
import type React from "react";
import { buildJobDecisionBrief } from "@/client/lib/job-decision";
import { cn } from "@/lib/utils";

interface FitAssessmentProps {
  job: Job;
  className?: string;
}

export const FitAssessment: React.FC<FitAssessmentProps> = ({
  job,
  className,
}) => {
  if (!job.suitabilityReason && job.suitabilityScore == null) return null;

  const brief = buildJobDecisionBrief(job);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary/70">
          <Sparkles className="h-3 w-3" />
          Fit Assessment
        </div>
        <p className="text-xs font-medium leading-relaxed text-foreground/90">
          {job.suitabilityReason || brief.rationale}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Target className="h-3 w-3" />
            Recommendation
          </div>
          <div className="text-sm font-semibold text-foreground">
            {brief.recommendationLabel}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Recommended effort: {brief.effortLabel}
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Watchouts
          </div>
          <ul className="space-y-1 text-xs leading-relaxed text-foreground/85">
            {brief.watchouts.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
