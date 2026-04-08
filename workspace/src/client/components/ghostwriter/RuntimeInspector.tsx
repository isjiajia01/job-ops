import type {
  GhostwriterAssistantPayload,
  GhostwriterDiagnosticSummaryItem,
  JobChatRun,
  JobChatRunEvent,
} from "@shared/types";
import type React from "react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunTimeline } from "./RunTimeline";

function renderDiagnosticSummary(
  diagnostics?: GhostwriterDiagnosticSummaryItem[],
) {
  if (!diagnostics || diagnostics.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {diagnostics.map((item) => (
        <span key={`${item.severity}-${item.category}`} className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
          {item.severity} · {item.category} · {item.count}
        </span>
      ))}
    </div>
  );
}

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
  const hasClaims = Boolean(currentRuntime?.claimPlan?.claims.length);
  const hasEvidenceSelection = Boolean(
    currentRuntime?.evidenceSelection?.allowedModuleLabels.length ||
      currentRuntime?.evidenceSelection?.blockedClaims.length,
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
          {currentRuntime.review ? (
            <div className="mt-2 rounded border border-border/50 bg-background/50 p-2 text-[11px] text-muted-foreground">
              <div><span className="font-medium text-foreground/80">review:</span> {currentRuntime.review.summary}</div>
              <div className="mt-1">specificity {currentRuntime.review.specificity}/5 · evidence {currentRuntime.review.evidenceStrength}/5 · risk {currentRuntime.review.overclaimRisk}/5 · naturalness {currentRuntime.review.naturalness}/5</div>
              {renderDiagnosticSummary(currentRuntime.review.diagnosticSummary)}
              {currentRuntime.review.diagnostics?.length ? (
                <div className="mt-2 space-y-1">
                  {currentRuntime.review.diagnostics.slice(0, 4).map((diagnostic) => (
                    <div key={`${diagnostic.code}-${diagnostic.detail}`} className="rounded border border-border/50 bg-background/60 px-2 py-1">
                      <span className="font-medium text-foreground/80">{diagnostic.severity}</span> · {diagnostic.code} · {diagnostic.detail}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-background/50 p-1">
          {hasOverview ? <TabsTrigger value="overview">Overview</TabsTrigger> : null}
          {hasFit ? <TabsTrigger value="fit">Fit</TabsTrigger> : null}
          {hasClaims ? <TabsTrigger value="claims">Claims</TabsTrigger> : null}
          {hasEvidenceSelection ? <TabsTrigger value="evidence">Evidence</TabsTrigger> : null}
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

        <TabsContent value="claims" className="mt-3">
          {currentRuntime?.claimPlan ? (
            <div className="space-y-3">
              <div className="rounded border border-border/50 bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  target role angle
                </div>
                <div className="mt-1 text-muted-foreground">{currentRuntime.claimPlan.targetRoleAngle}</div>
                <div className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                  opening strategy
                </div>
                <div className="mt-1 text-muted-foreground">{currentRuntime.claimPlan.openingStrategy}</div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {currentRuntime.claimPlan.claims.map((claim) => (
                  <div key={claim.id} className="rounded border border-border/50 bg-background/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {claim.priority} claim
                      </div>
                      <div className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {claim.riskLevel} risk
                      </div>
                    </div>
                    <div className="mt-2 text-foreground/90">{claim.claim}</div>
                    {claim.evidenceSnippets.length ? (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        evidence: {claim.evidenceSnippets.slice(0, 2).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {currentRuntime.claimPlan.excludedClaims.length ? (
                <div className="rounded border border-amber-200/60 bg-amber-50/50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    excluded claims
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    {currentRuntime.claimPlan.excludedClaims.join(" · ")}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No claim plan yet.</div>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="mt-3">
          {currentRuntime?.evidenceSelection ? (
            <div className="space-y-3">
              <div className="rounded border border-border/50 bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  lead proof point
                </div>
                <div className="mt-1 text-foreground/90">
                  {currentRuntime.evidenceSelection.leadModuleLabel ?? "No lead proof point selected."}
                </div>
              </div>
              {currentRuntime.evidenceSelection.allowedModuleLabels.length ? (
                <div className="rounded border border-border/50 bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    allowed modules
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {currentRuntime.evidenceSelection.allowedModuleLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-foreground/80"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {currentRuntime.evidenceSelection.blockedClaims.length ? (
                <div className="rounded border border-amber-200/60 bg-amber-50/50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    blocked claims
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    {currentRuntime.evidenceSelection.blockedClaims.join(" · ")}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No evidence selection yet.</div>
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
