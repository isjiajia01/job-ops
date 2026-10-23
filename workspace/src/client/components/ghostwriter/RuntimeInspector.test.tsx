import type { GhostwriterAssistantPayload, JobChatRun, JobChatRunEvent } from "@shared/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuntimeInspector } from "./RuntimeInspector";

describe("RuntimeInspector", () => {
  it("renders tabbed runtime inspector sections and timeline", () => {
    const currentRuntime: GhostwriterAssistantPayload = {
      response: "hello",
      coverLetterDraft: null,
      coverLetterKind: null,
      resumePatch: null,
      fitBrief: {
        strongestPoints: ["Strong planning fit", "Operational optimisation evidence"],
        risks: ["Limited direct ownership history"],
        recommendedAngle: "Planning-heavy early-career operator",
      },
      runtimePlan: {
        role: "Application Writing Strategist",
        taskKind: "mixed",
        deliverable: "Produce aligned drafting outputs.",
        responseMode: "mixed",
        executionNotes: ["Lead with evidence"],
        selectedTools: ["job_brief", "proof_point_bank"],
      },
      claimPlan: {
        targetRoleAngle: "Planning-heavy early-career operator",
        openingStrategy: "Open from the operating need and anchor it in the lead proof point.",
        claims: [
          {
            id: "claim-role-fit",
            claim: "Position the candidate around planning-heavy early-career fit.",
            jdRequirement: "Planning and optimisation support",
            evidenceIds: ["module-1"],
            evidenceSnippets: ["Operational optimisation evidence"],
            priority: "must",
            riskLevel: "low",
            guidance: "Lead with strongest proof point",
          },
        ],
        excludedClaims: ["Do not overstate direct ownership"],
        reviewerFocus: ["Prefer evidence-backed wording"],
      },
      executionTrace: [{ stage: "plan", summary: "Built runtime plan." }],
      toolTrace: null,
    };

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
      <RuntimeInspector
        activeRunId={null}
        currentRuntime={currentRuntime}
        isStreaming={false}
        runTimeline={runTimeline}
        runs={runs}
        selectedRunId="run-1"
        onSelectRun={vi.fn()}
      />,
    );

    expect(screen.getByText("Runtime inspector")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Fit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Claims" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Trace" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeInTheDocument();

    expect(screen.getByText(/execution notes/i)).toBeInTheDocument();
    expect(screen.getByText(/Final selection/i)).toBeInTheDocument();
    expect(screen.getByText(/Selected direct advisory response/i)).toBeInTheDocument();
    expect(screen.getByText(/winner angle:/i)).toBeInTheDocument();
    expect(screen.getByText(/winner reason:/i)).toBeInTheDocument();
    expect(screen.getByText(/evidence-heavy/i)).toBeInTheDocument();
  });
});
