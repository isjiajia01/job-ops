import { PageHeader, StatusIndicator } from "@client/components/layout";
import type { JobSource } from "@shared/types.js";
import { ClipboardPaste, FileStack, Loader2, Play, Square } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface OrchestratorHeaderProps {
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  isPipelineRunning: boolean;
  isCancelling: boolean;
  pipelineSources: JobSource[];
  onOpenAutomaticRun: () => void;
  onOpenManualImport: () => void;
  onCancelPipeline: () => void;
}

export const OrchestratorHeader: React.FC<OrchestratorHeaderProps> = ({
  navOpen,
  onNavOpenChange,
  isPipelineRunning,
  isCancelling,
  pipelineSources,
  onOpenAutomaticRun,
  onOpenManualImport,
  onCancelPipeline,
}) => {
  const actions = isPipelineRunning ? (
    <Button
      size="sm"
      onClick={onCancelPipeline}
      disabled={isCancelling}
      variant="destructive"
      className="gap-2"
    >
      {isCancelling ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Square className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {isCancelling ? `Cancelling (${pipelineSources.length})` : `Cancel run`}
      </span>
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <Button asChild size="sm" variant="ghost" className="gap-2">
        <Link to="/applications">
          <FileStack className="h-4 w-4" />
          <span className="hidden sm:inline">Applications</span>
        </Link>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onOpenManualImport}
        className="gap-2"
      >
        <ClipboardPaste className="h-4 w-4" />
        <span className="hidden sm:inline">Paste JD</span>
      </Button>
      <Button size="sm" onClick={onOpenAutomaticRun} className="gap-2">
        <Play className="h-4 w-4" />
        <span className="hidden sm:inline">Run pipeline</span>
      </Button>
    </div>
  );

  return (
    <PageHeader
      icon={() => (
        <img src="/favicon.png" alt="" className="size-8 rounded-lg" />
      )}
      title="Legacy Pipeline"
      subtitle="Crawler and batch-processing tools kept for fallback workflows"
      badge="Legacy"
      navOpen={navOpen}
      onNavOpenChange={onNavOpenChange}
      statusIndicator={
        isPipelineRunning ? (
          <StatusIndicator label="Pipeline running" variant="amber" />
        ) : undefined
      }
      actions={actions}
    />
  );
};
