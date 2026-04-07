import type { JobChatRun, JobChatRunEvent, JobChatRunPhase } from "@shared/types";
import type React from "react";

function phaseTone(phase: string): string {
  if (phase === "terminal") return "border-emerald-200/60 bg-emerald-50/60";
  if (phase === "generation") return "border-blue-200/60 bg-blue-50/50";
  if (phase === "strategy") return "border-violet-200/60 bg-violet-50/50";
  if (phase === "runtime") return "border-amber-200/60 bg-amber-50/50";
  return "border-border/50 bg-muted/20";
}

function formatRunLabel(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhaseLabel(phase: JobChatRunPhase): string {
  if (phase === "context") return "Context";
  if (phase === "runtime") return "Runtime";
  if (phase === "memory") return "Memory";
  if (phase === "strategy") return "Strategy";
  if (phase === "generation") return "Generation";
  if (phase === "finalize") return "Finalize";
  if (phase === "terminal") return "Terminal";
  return "Run";
}

function renderChipRow(chips: string[]) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip, index) => (
        <span
          key={`${chip}-${index}`}
          className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function renderArraySummary(label: string, value?: string[]) {
  if (!value || value.length === 0) return null;
  return (
    <div key={label} className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}:</span>{" "}
      {value.slice(0, 4).join(" · ")}
    </div>
  );
}

function renderPayloadPreview(event: JobChatRunEvent) {
  if (!event.payload) return null;

  switch (event.eventType) {
    case "status": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow(
            [payload.model, payload.provider].filter((value): value is string => Boolean(value)),
          )}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">requestId:</span>{" "}
            {payload.requestId}
          </div>
        </div>
      );
    }
    case "context_built": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([payload.employer, payload.title].filter((value): value is string => Boolean(value)))}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">historyMessages:</span>{" "}
            {payload.historyMessages}
          </div>
          {renderArraySummary("topFitReasons", payload.topFitReasons)}
          {renderArraySummary("topEvidence", payload.topEvidence)}
        </div>
      );
    }
    case "runtime_planned": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([payload.taskKind, payload.responseMode])}
          {renderArraySummary("selectedTools", payload.selectedTools)}
        </div>
      );
    }
    case "strategy_requested": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([payload.taskKind])}
          <div className="text-[11px] italic text-muted-foreground/90">“{payload.prompt}”</div>
        </div>
      );
    }
    case "strategy_built": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderArraySummary("strongestEvidence", payload.strongestEvidence)}
          {renderArraySummary("weakPoints", payload.weakPoints)}
          {renderArraySummary("paragraphPlan", payload.paragraphPlan)}
        </div>
      );
    }
    case "claim_plan_built": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([`claims:${payload.claimCount}`, `must:${payload.mustClaimCount}`])}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">openingStrategy:</span>{" "}
            {payload.openingStrategy}
          </div>
          {renderArraySummary("excludedClaims", payload.excludedClaims)}
        </div>
      );
    }
    case "direct_reply": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([payload.responseMode])}
          <div className="text-[11px] italic text-muted-foreground/90">“{payload.prompt}”</div>
        </div>
      );
    }
    case "memory_update": {
      const payload = event.payload;
      return <div className="mt-2 text-[11px] italic text-muted-foreground/90">“{payload.prompt}”</div>;
    }
    case "variant_requested": {
      const payload = event.payload;
      return renderChipRow(
        [payload.variant, payload.coverLetterKind].filter((value): value is string => Boolean(value)),
      );
    }
    case "variant_completed": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([
            payload.variant,
            payload.hasCoverLetterDraft ? "cover-letter" : "no-cover-letter",
            payload.hasResumePatch ? "resume-patch" : "no-resume-patch",
          ])}
          <div className="text-[11px] italic text-muted-foreground/90">“{payload.responsePreview}”</div>
        </div>
      );
    }
    case "editorial_rewrite_requested": {
      const payload = event.payload;
      return <div className="mt-2">{renderArraySummary("triggerReasons", payload.triggerReasons)}</div>;
    }
    case "review_completed": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([
            `specificity:${payload.specificity}`,
            `evidence:${payload.evidenceStrength}`,
            `risk:${payload.overclaimRisk}`,
            `naturalness:${payload.naturalness}`,
            payload.shouldRewrite ? "rewrite" : "keep",
          ])}
          <div className="text-[11px] text-muted-foreground">{payload.summary}</div>
          {renderArraySummary("issues", payload.issues)}
        </div>
      );
    }
    case "review_rewrite_requested": {
      const payload = event.payload;
      return <div className="mt-2">{renderArraySummary("issues", payload.issues)}</div>;
    }
    case "editorial_rewrite_completed": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderArraySummary("triggerReasons", payload.triggerReasons)}
          {renderArraySummary("improvedFields", payload.improvedFields)}
        </div>
      );
    }
    case "selection": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([
            payload.selectedOutputMode,
            payload.hasCoverLetterDraft ? "cover-letter" : "no-cover-letter",
            payload.coverLetterKind ?? "no-cover-letter-kind",
            payload.hasResumePatch ? "resume-patch" : "no-resume-patch",
            ...(payload.winningVariant ? [payload.winningVariant] : []),
          ])}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">winnerReason:</span>{" "}
            {payload.winnerReason}
          </div>
          {typeof payload.candidateCount === "number" ? (
            <div className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">candidateCount:</span>{" "}
              {payload.candidateCount}
            </div>
          ) : null}
          {renderArraySummary("fitBriefStrongPoints", payload.fitBriefStrongPoints)}
          {renderArraySummary("strongestEvidence", payload.strongestEvidence)}
          {renderArraySummary("coveredClaimIds", payload.coveredClaimIds)}
        </div>
      );
    }
    case "variant_scored": {
      const payload = event.payload;
      return (
        <div className="mt-2 space-y-2">
          {renderChipRow([
            payload.variant,
            `score:${payload.finalScore}`,
            `must:${payload.mustClaimCoverage}`,
            `evidence:${payload.evidenceCoverage}`,
          ])}
          {renderArraySummary("coveredClaimIds", payload.coveredClaimIds)}
          {renderArraySummary("penalties", payload.penalties)}
        </div>
      );
    }
    case "completed": {
      const payload = event.payload;
      return payload.outputChars ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">outputChars:</span>{" "}
          {payload.outputChars}
        </div>
      ) : null;
    }
    case "failed": {
      const payload = event.payload;
      return payload.code ? renderChipRow([payload.code]) : null;
    }
    case "cancelled":
      return null;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

type RunTimelineProps = {
  activeRunId: string | null;
  compact?: boolean;
  isStreaming: boolean;
  runTimeline: JobChatRunEvent[];
  runs: JobChatRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void | Promise<void>;
};

export const RunTimeline: React.FC<RunTimelineProps> = ({
  activeRunId,
  compact = false,
  isStreaming,
  runTimeline,
  runs,
  selectedRunId,
  onSelectRun,
}) => {
  if (runs.length === 0) return null;

  const groupedTimeline = runTimeline.reduce<Array<{ phase: JobChatRunPhase; events: JobChatRunEvent[] }>>(
    (groups, event) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.phase === event.phase) {
        lastGroup.events.push(event);
        return groups;
      }
      groups.push({ phase: event.phase, events: [event] });
      return groups;
    },
    [],
  );

  return (
    <div className={compact ? "rounded-lg border border-border/60 bg-background/50 p-3" : "mb-3 rounded-lg border border-border/60 bg-background/70 p-3"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-foreground/90">Run timeline</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {isStreaming
              ? "Streaming internal Ghostwriter steps in real time."
              : "Inspect the latest persisted Ghostwriter runs and trace outputs."}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {runs.slice(0, 6).map((run) => {
            const isSelected = run.id === selectedRunId;
            const isLive = run.id === activeRunId && isStreaming;
            return (
              <button
                type="button"
                key={run.id}
                onClick={() => void onSelectRun(run.id)}
                className={[
                  "rounded-full border px-2.5 py-1 text-[10px] transition",
                  isSelected
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {isLive ? "Live" : formatRunLabel(run.startedAt)} · {run.status}
              </button>
            );
          })}
        </div>
      </div>

      {runTimeline.length > 0 ? (
        <div className="mt-3 space-y-4">
          {groupedTimeline.map((group, groupIndex) => (
            <div key={`${group.phase}-${groupIndex}`} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {formatPhaseLabel(group.phase)}
                </div>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="space-y-2">
                {group.events.map((event) => {
                  const isLatest = event.id === runTimeline[runTimeline.length - 1]?.id && isStreaming;
                  return (
                    <div
                      key={event.id}
                      className={`rounded-md border p-2.5 ${phaseTone(event.phase)} ${isLatest ? "ring-1 ring-foreground/10" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground/90">
                          {event.title}
                        </div>
                        <div className="flex items-center gap-2">
                          {isLatest ? (
                            <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-background">
                              live
                            </span>
                          ) : null}
                          <div className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {event.phase}
                          </div>
                        </div>
                      </div>
                      {event.detail ? (
                        <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          {event.detail}
                        </div>
                      ) : null}
                      {renderPayloadPreview(event)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-[11px] text-muted-foreground">
          No persisted timeline events for this run yet.
        </div>
      )}
    </div>
  );
};
