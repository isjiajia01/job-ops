import { PipelineProgress } from "@client/components";
import { summarizeTriageBuckets } from "@client/lib/job-decision";
import { useWelcomeMessage } from "@client/hooks/useWelcomeMessage";
import type { JobListItem, JobStatus } from "@shared/types.js";
import type React from "react";

interface OrchestratorSummaryProps {
  stats: Record<JobStatus, number>;
  jobs: JobListItem[];
  isPipelineRunning: boolean;
}

export const OrchestratorSummary: React.FC<OrchestratorSummaryProps> = ({
  jobs,
  isPipelineRunning,
}) => {
  const welcomeText = useWelcomeMessage();
  const triage = summarizeTriageBuckets(jobs);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium tracking-tight">{welcomeText}</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Apply now
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {triage.applyNow}
          </div>
          <div className="text-xs text-muted-foreground">
            High-fit jobs ready for fast action
          </div>
        </div>
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Tailor and apply
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {triage.tailorAndApply}
          </div>
          <div className="text-xs text-muted-foreground">
            Worth custom positioning before sending
          </div>
        </div>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Keep warm
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {triage.keepWarm}
          </div>
          <div className="text-xs text-muted-foreground">
            Promising, but not obvious top priorities yet
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Skip
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {triage.skip}
          </div>
          <div className="text-xs text-muted-foreground">
            Low-fit opportunities to avoid over-investing in
          </div>
        </div>
      </div>

      {isPipelineRunning && (
        <div className="max-w-3xl">
          <PipelineProgress isRunning={isPipelineRunning} />
        </div>
      )}
    </section>
  );
};
