import { PipelineProgress } from "@client/components";
import { useWelcomeMessage } from "@client/hooks/useWelcomeMessage";
import type { JobStatus } from "@shared/types.js";
import type React from "react";

interface LegacyJobsSummaryProps {
  stats: Record<JobStatus, number>;
  isPipelineRunning: boolean;
}

export const LegacyJobsSummary: React.FC<LegacyJobsSummaryProps> = ({
  isPipelineRunning,
}) => {
  const welcomeText = useWelcomeMessage();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium tracking-tight">{welcomeText}</h1>
      </div>

      {isPipelineRunning && (
        <div className="max-w-3xl">
          <PipelineProgress isRunning={isPipelineRunning} />
        </div>
      )}
    </section>
  );
};
