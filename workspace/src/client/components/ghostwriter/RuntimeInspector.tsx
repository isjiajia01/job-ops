import type {
  GhostwriterAssistantPayload,
  JobChatRun,
  JobChatRunEvent,
} from "@shared/types";
import type React from "react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunTimeline } from "./RunTimeline";

type RuntimeInspectorProps = {
  activeRunId: string | null;
  currentRuntime: GhostwriterAssistantPayload | null;
  isStreaming: boolean;
  runTimeline: JobChatRunEvent[];
  runs: JobChatRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void | Promise<void>;
};

export const RuntimeInspector: React.FC<RuntimeInspectorProps> = ({
  activeRunId,
  currentRuntime,
  isStreaming,
  runTimeline,
  runs,
  selectedRunId,
  onSelectRun,
}) => {
  if (!currentRuntime && runs.length === 0) return null;

  const latestSelectionEvent = [...runTimeline]
    .reverse()
    .find((event) => event.eventType === "selection");

  const hasOverview = Boolean(currentRuntime?.runtimePlan);
  const hasFit = Boolean(
    currentRuntime?.fitBrief?.strongestPoints.length ||
      currentRuntime?.fitBrief?.risks.length,
  );
  const hasTrace = Boolean(currentRuntime?.executionTrace?.length);
  const defaultTab = hasOverview
    ? "overview"
    : hasFit
      ? "fit"
      : hasTrace
        ? "trace"
        : "timeline";
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-foreground/90">Runtime inspector</div>
          <div className="mt-1 text-muted-foreground">
            {currentRuntime?.runtimePlan?.deliverable ??
              "Trace the current Ghostwriter runtime and recent persisted runs."}
          </div>
        </div>
        {currentRuntime?.runtimePlan?.taskKind ? (
          <div className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {currentRuntime.runtimePlan.taskKind}
          </div>
        ) : null}
      </div>

      {currentRuntime?.runtimePlan ? (
        <div className="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Final selection
              </div>
              <div className="mt-1 text-sm font-medium text-foreground/90">
                {latestSelectionEvent?.payload.selectedOutputMode === "application_email"
                  ? "Selected application email draft"
                  : latestSelectionEvent?.payload.selectedOutputMode === "cover_letter"
                    ? "Selected cover letter draft"
                    : latestSelectionEvent?.payload.selectedOutputMode === "resume_patch"
                      ? "Selected resume patch response"
                      : currentRuntime.coverLetterDraft
                        ? currentRuntime.coverLetterKind === "email"
                          ? "Selected application email draft"
                          : "Selected cover letter draft"
                        : currentRuntime.resumePatch
                          ? "Selected resume patch response"
                          : "Selected direct advisory response"}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {latestSelectionEvent?.payload.selectedOutputMode ? (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {latestSelectionEvent.payload.selectedOutputMode}
                </span>
              ) : currentRuntime.coverLetterDraft ? (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {currentRuntime.coverLetterKind === "email" ? "email" : "cover-letter"}
                </span>
              ) : currentRuntime.resumePatch ? (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  resume-patch
                </span>
              ) : (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  direct-response
                </span>
              )}
              {latestSelectionEvent?.payload.winningVariant ? (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {latestSelectionEvent.payload.winningVariant}
                </span>
              ) : null}
            </div>
          </div>
          {currentRuntime.fitBrief?.recommendedAngle ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">winner angle:</span>{" "}
              {currentRuntime.fitBrief.recommendedAngle}
            </div>
          ) : null}
          {latestSelectionEvent?.payload.winnerReason ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">winner reason:</span>{" "}
              {latestSelectionEvent.payload.winnerReason}
            </div>
          ) : null}
          {(latestSelectionEvent?.payload.strongestEvidence?.length ||
            currentRuntime.fitBrief?.strongestPoints.length) ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">evidence carried forward:</span>{" "}
              {(latestSelectionEvent?.payload.strongestEvidence?.length
                ? latestSelectionEvent.payload.strongestEvidence
                : currentRuntime.fitBrief?.strongestPoints.slice(0, 3) ?? []
              ).join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-background/50 p-1">
          {hasOverview ? <TabsTrigger value="overview">Overview</TabsTrigger> : null}
          {hasFit ? <TabsTrigger value="fit">Fit</TabsTrigger> : null}
          {hasTrace ? <TabsTrigger value="trace">Trace</TabsTrigger> : null}
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          {currentRuntime?.runtimePlan ? (
            <div className="space-y-3">
              {currentRuntime.runtimePlan.selectedTools.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {currentRuntime.runtimePlan.selectedTools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-foreground/80"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              ) : null}
              {currentRuntime.runtimePlan.executionNotes.length ? (
                <div className="rounded border border-border/50 bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    execution notes
                  </div>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {currentRuntime.runtimePlan.executionNotes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No runtime overview yet.</div>
          )}
        </TabsContent>

        <TabsContent value="fit" className="mt-3">
          {currentRuntime?.fitBrief ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded border border-emerald-200/60 bg-emerald-50/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  strongest points
                </div>
                <div className="mt-2 text-muted-foreground">
                  {currentRuntime.fitBrief.strongestPoints.length > 0
                    ? currentRuntime.fitBrief.strongestPoints.slice(0, 4).join(" · ")
                    : "No strongest-point summary yet."}
                </div>
              </div>
              <div className="rounded border border-amber-200/60 bg-amber-50/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  watchouts
                </div>
                <div className="mt-2 text-muted-foreground">
                  {currentRuntime.fitBrief.risks.length > 0
                    ? currentRuntime.fitBrief.risks.slice(0, 4).join(" · ")
                    : "No major watchouts captured."}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No fit brief yet.</div>
          )}
        </TabsContent>

        <TabsContent value="trace" className="mt-3">
          {currentRuntime?.executionTrace?.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {currentRuntime.executionTrace.map((step) => (
                <div
                  key={`${step.stage}-${step.summary}`}
                  className="rounded border border-border/50 bg-background/60 p-3"
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {step.stage}
                  </div>
                  <div className="mt-1 text-muted-foreground">{step.summary}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No execution trace yet.</div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-3">
          <RunTimeline
            activeRunId={activeRunId}
            isStreaming={isStreaming}
            runTimeline={runTimeline}
            runs={runs}
            selectedRunId={selectedRunId}
            onSelectRun={onSelectRun}
            compact
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
