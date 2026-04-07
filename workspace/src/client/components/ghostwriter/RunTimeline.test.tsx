import type { JobChatRun, JobChatRunEvent } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunTimeline } from "./RunTimeline";

describe("RunTimeline", () => {
  it("renders run chips and payload previews", () => {
    const runs: JobChatRun[] = [
      {
        id: "run-1",
        threadId: "thread-1",
        jobId: "job-1",
        status: "completed",
        model: "model-a",
        provider: "openrouter",
        errorCode: null,
        errorMessage: null,
        startedAt: new Date("2026-04-07T10:00:00.000Z").getTime(),
        completedAt: new Date("2026-04-07T10:01:00.000Z").getTime(),
        requestId: "req-1",
        createdAt: "2026-04-07T10:00:00.000Z",
        updatedAt: "2026-04-07T10:01:00.000Z",
      },
    ];

    const runTimeline: JobChatRunEvent[] = [
      {
        id: "event-1",
        runId: "run-1",
        threadId: "thread-1",
        jobId: "job-1",
        sequence: 1,
        phase: "runtime",
        eventType: "runtime_planned",
        title: "Runtime planned",
        detail: "Produce aligned drafting outputs.",
        payload: {
          taskKind: "mixed",
          responseMode: "mixed",
          selectedTools: ["job_brief", "proof_point_bank"],
        },
        createdAt: 1,
      },
      {
        id: "event-2",
        runId: "run-1",
        threadId: "thread-1",
        jobId: "job-1",
        sequence: 2,
        phase: "finalize",
        eventType: "selection",
        title: "Final response selected",
        detail: "Ranked the generated candidate(s) and prepared the final structured assistant payload.",
        payload: {
          hasCoverLetterDraft: false,
          coverLetterKind: null,
          hasResumePatch: false,
          fitBriefStrongPoints: ["Strong planning fit"],
          selectedOutputMode: "direct_response",
          winnerReason: "Best balanced specificity and evidence density.",
          candidateCount: 3,
          winningVariant: "evidence-heavy",
          strongestEvidence: ["Operational optimisation evidence"],
        },
        createdAt: 2,
      },
    ];

    render(
      <RunTimeline
        activeRunId={null}
        isStreaming={false}
        runTimeline={runTimeline}
        runs={runs}
        selectedRunId="run-1"
        onSelectRun={vi.fn()}
      />,
    );

    expect(screen.getByText("Run timeline")).toBeInTheDocument();
    expect(screen.getByText("Runtime")).toBeInTheDocument();
    expect(screen.getByText("Finalize")).toBeInTheDocument();
    expect(screen.getByText("Runtime planned")).toBeInTheDocument();
    expect(screen.getByText(/selectedTools:/i)).toBeInTheDocument();
    expect(screen.getByText(/winnerReason:/i)).toBeInTheDocument();
    expect(screen.getByText(/evidence-heavy/i)).toBeInTheDocument();
    expect(screen.getAllByText("mixed").length).toBeGreaterThan(0);
  });

  it("calls onSelectRun when a run chip is clicked", () => {
    const onSelectRun = vi.fn();
    const runs: JobChatRun[] = [
      {
        id: "run-1",
        threadId: "thread-1",
        jobId: "job-1",
        status: "completed",
        model: "model-a",
        provider: "openrouter",
        errorCode: null,
        errorMessage: null,
        startedAt: 1,
        completedAt: 2,
        requestId: "req-1",
        createdAt: "2026-04-07T10:00:00.000Z",
        updatedAt: "2026-04-07T10:01:00.000Z",
      },
    ];

    render(
      <RunTimeline
        activeRunId={null}
        isStreaming={false}
        runTimeline={[]}
        runs={runs}
        selectedRunId="run-1"
        onSelectRun={onSelectRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /completed/i }));
    expect(onSelectRun).toHaveBeenCalledWith("run-1");
  });
});
