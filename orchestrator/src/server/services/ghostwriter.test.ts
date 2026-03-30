import type { JobChatMessage } from "@shared/types";
import { parseGhostwriterAssistantContent } from "@shared/utils/ghostwriter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  buildJobChatPromptContext: vi.fn(),
  getProfile: vi.fn(),
  getCandidateKnowledgeBase: vi.fn(),
  llmCallJson: vi.fn(),
  repo: {
    getOrCreateThreadForJob: vi.fn(),
    getThreadForJob: vi.fn(),
    listMessagesForThread: vi.fn(),
    getActiveRunForThread: vi.fn(),
    createMessage: vi.fn(),
    createRun: vi.fn(),
    updateMessage: vi.fn(),
    completeRun: vi.fn(),
    completeRunIfRunning: vi.fn(),
    getMessageById: vi.fn(),
    getLatestAssistantMessage: vi.fn(),
    getRunById: vi.fn(),
    getActivePathFromRoot: vi.fn(),
    getAncestorPath: vi.fn(),
    setActiveChild: vi.fn(),
    setActiveRoot: vi.fn(),
    getSiblingsOf: vi.fn(),
    getChildrenOfMessage: vi.fn(),
  },
  settings: {
    getAllSettings: vi.fn(),
  },
  jobs: {
    updateJob: vi.fn(),
  },
}));

vi.mock("@infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@infra/request-context", () => ({
  getRequestId: mocks.getRequestId,
}));

vi.mock("./ghostwriter-context", () => ({
  buildJobChatPromptContext: mocks.buildJobChatPromptContext,
}));

vi.mock("./profile", () => ({
  getProfile: mocks.getProfile,
}));

vi.mock("./candidate-knowledge", () => ({
  getCandidateKnowledgeBase: mocks.getCandidateKnowledgeBase,
}));

vi.mock("../repositories/settings", () => ({
  getAllSettings: mocks.settings.getAllSettings,
}));

vi.mock("../repositories/jobs", () => ({
  updateJob: mocks.jobs.updateJob,
}));

vi.mock("../repositories/ghostwriter", () => ({
  getOrCreateThreadForJob: mocks.repo.getOrCreateThreadForJob,
  getThreadForJob: mocks.repo.getThreadForJob,
  listMessagesForThread: mocks.repo.listMessagesForThread,
  getActiveRunForThread: mocks.repo.getActiveRunForThread,
  createMessage: mocks.repo.createMessage,
  createRun: mocks.repo.createRun,
  updateMessage: mocks.repo.updateMessage,
  completeRun: mocks.repo.completeRun,
  completeRunIfRunning: mocks.repo.completeRunIfRunning,
  getMessageById: mocks.repo.getMessageById,
  getLatestAssistantMessage: mocks.repo.getLatestAssistantMessage,
  getRunById: mocks.repo.getRunById,
  getActivePathFromRoot: mocks.repo.getActivePathFromRoot,
  getAncestorPath: mocks.repo.getAncestorPath,
  setActiveChild: mocks.repo.setActiveChild,
  getSiblingsOf: mocks.repo.getSiblingsOf,
  getChildrenOfMessage: mocks.repo.getChildrenOfMessage,
  setActiveRoot: mocks.repo.setActiveRoot,
}));

vi.mock("./llm/service", () => ({
  LlmService: class {
    callJson = mocks.llmCallJson;
  },
}));

import {
  cancelRun,
  cancelRunForJob,
  regenerateMessage,
  sendMessage,
  sendMessageForJob,
} from "./ghostwriter";

const thread = {
  id: "thread-1",
  jobId: "job-1",
  title: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastMessageAt: null,
  activeRootMessageId: "user-1",
};

const baseUserMessage: JobChatMessage = {
  id: "user-1",
  threadId: "thread-1",
  jobId: "job-1",
  role: "user",
  content: "Tell me about this role",
  status: "complete",
  tokensIn: 6,
  tokensOut: null,
  version: 1,
  replacesMessageId: null,
  parentMessageId: null,
  activeChildId: "assistant-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseAssistantMessage: JobChatMessage = {
  id: "assistant-1",
  threadId: "thread-1",
  jobId: "job-1",
  role: "assistant",
  content: "Draft response",
  status: "complete",
  tokensIn: 6,
  tokensOut: 4,
  version: 1,
  replacesMessageId: null,
  parentMessageId: "user-1",
  activeChildId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ghostwriter service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getRequestId.mockReturnValue("req-123");
    mocks.settings.getAllSettings.mockResolvedValue({});
    mocks.buildJobChatPromptContext.mockResolvedValue({
      job: { id: "job-1" },
      profile: {
        basics: {
          name: "Candidate Name",
          headline:
            "Planning Analytics Candidate | Python, Excel, Operations Research, Decision Support",
          summary:
            "Strongest fit is in planning-oriented and analytics-heavy roles with Python and Excel analysis.",
        },
      },
      knowledgeBase: {
        personalFacts: [
          {
            id: "fact-1",
            title: "Target roles",
            detail:
              "Targeting demand planning, supply planning, logistics planning, and planning analytics roles.",
          },
        ],
        projects: [],
      },
      style: {
        tone: "professional",
        formality: "medium",
        constraints: "",
        doNotUse: "",
      },
      systemPrompt: "system prompt",
      jobSnapshot: '{"job":"snapshot"}',
      profileSnapshot: "profile snapshot",
      companyResearchSnapshot:
        "Company: ACME\nResearch summary: ACME is expanding its analytics-driven operations.",
      evidencePack: {
        targetRoleSummary: "Planning-heavy role",
        topFitReasons: ["Planning fit"],
        topEvidence: ["DTU planning thesis"],
        biggestGaps: ["Avoid overstating seniority"],
        recommendedAngle: "Lead with planning-oriented problem solving.",
        forbiddenClaims: ["Do not claim senior ownership."],
        toneRecommendation: "Direct and practical.",
      },
      evidencePackSnapshot:
        "Target role summary: Planning-heavy role\nTop fit reasons:\n- Planning fit",
    });
    mocks.getProfile.mockResolvedValue({
      basics: {
        name: "Candidate Name",
        headline:
          "Planning Analytics Candidate | Python, Excel, Operations Research, Decision Support",
        summary:
          "Strongest fit is in planning-oriented and analytics-heavy roles with Python and Excel analysis.",
      },
      sections: {
        skills: {
          items: [
            {
              id: "skill-1",
              visible: true,
              name: "Planning",
              description: "",
              level: 4,
              keywords: ["forecasting", "excel", "python"],
            },
          ],
        },
        experience: {
          items: [
            {
              id: "exp-1",
              visible: true,
              company: "Canton DaJiao Real Estate Development Co., Ltd",
              position: "Business Analysis Intern",
              location: "",
              date: "2022 - 2023",
              summary:
                "Automated reporting workflows using Python and Excel and translated operational data into decision-ready materials.",
            },
          ],
        },
        projects: {
          items: [
            {
              id: "project-1",
              visible: true,
              name: "Rolling-Horizon Planning for Last-Mile Delivery",
              description: "",
              date: "2025 - 2026",
              summary:
                "Multi-day planning problem in last-mile delivery with routing and operational constraints.",
              keywords: ["planning", "routing", "operations research"],
              url: "",
            },
          ],
        },
      },
    });
    mocks.getCandidateKnowledgeBase.mockResolvedValue({
      personalFacts: [
        {
          id: "fact-1",
          title: "Target roles",
          detail:
            "Targeting demand planning, supply planning, logistics planning, and planning analytics roles.",
        },
      ],
      projects: [],
    });

    mocks.repo.getOrCreateThreadForJob.mockResolvedValue(thread);
    mocks.repo.getThreadForJob.mockResolvedValue(thread);
    mocks.repo.getActiveRunForThread.mockResolvedValue(null);
    mocks.repo.createRun.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      status: "running",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: null,
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.repo.completeRun.mockResolvedValue(null);
    mocks.repo.completeRunIfRunning.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      status: "cancelled",
      model: "model-a",
      provider: "openrouter",
      errorCode: "REQUEST_TIMEOUT",
      errorMessage: "Generation cancelled by user",
      startedAt: Date.now(),
      completedAt: Date.now(),
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.repo.updateMessage.mockResolvedValue(baseAssistantMessage);
    mocks.repo.getMessageById.mockResolvedValue(baseAssistantMessage);
    mocks.repo.listMessagesForThread.mockResolvedValue([
      baseUserMessage,
      baseAssistantMessage,
      {
        ...baseAssistantMessage,
        id: "tool-1",
        role: "tool",
      },
      {
        ...baseAssistantMessage,
        id: "failed-1",
        role: "assistant",
        status: "failed",
      },
    ]);
    mocks.repo.getActivePathFromRoot.mockResolvedValue([
      baseUserMessage,
      baseAssistantMessage,
    ]);
    mocks.repo.getAncestorPath.mockResolvedValue([
      baseUserMessage,
      baseAssistantMessage,
    ]);
    mocks.repo.setActiveChild.mockResolvedValue(undefined);
    mocks.repo.setActiveRoot.mockResolvedValue(undefined);
    mocks.repo.getSiblingsOf.mockResolvedValue({
      siblings: [baseAssistantMessage],
      activeIndex: 0,
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: { response: "Thanks for your question." },
    });
    mocks.jobs.updateJob.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends message, runs LLM, and returns user + assistant messages", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-partial",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-partial",
      content: "Thanks for your question.",
      status: "complete",
      tokensOut: 7,
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);
    mocks.repo.getMessageById.mockResolvedValue(assistantComplete);

    const result = await sendMessageForJob({
      jobId: "job-1",
      content: "  Tell me about this role  ",
    });

    expect(result.runId).toBe("run-1");
    expect(result.userMessage.role).toBe("user");
    expect(result.assistantMessage?.role).toBe("assistant");
    expect(mocks.repo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-123",
      }),
    );

    const llmArg = mocks.llmCallJson.mock.calls[0][0];
    expect(llmArg.messages.slice(0, 5)).toEqual([
      { role: "system", content: "system prompt" },
      { role: "system", content: 'Job Context (JSON):\n{"job":"snapshot"}' },
      { role: "system", content: "Profile Context:\nprofile snapshot" },
      {
        role: "system",
        content:
          "Company Research Context:\nCompany: ACME\nResearch summary: ACME is expanding its analytics-driven operations.",
      },
      {
        role: "system",
        content:
          "Evidence Pack:\nTarget role summary: Planning-heavy role\nTop fit reasons:\n- Planning fit",
      },
    ]);
    expect(llmArg.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Tell me about this role",
    });
    expect(
      llmArg.messages.filter(
        (message: { role: string }) =>
          message.role !== "system" && message.role !== "user",
      ),
    ).toEqual([{ role: "assistant", content: "Draft response" }]);
  });

  it("applies resumePatch updates to the job and stores structured content", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-structured",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-structured",
      status: "complete",
      content: "",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockImplementation(async (_id, update) => ({
      ...assistantComplete,
      content: update.content ?? "",
      tokensIn: update.tokensIn ?? null,
      tokensOut: update.tokensOut ?? null,
    }));
    mocks.repo.getMessageById.mockImplementation(async () => {
      const [, update] = mocks.repo.updateMessage.mock.calls.at(-1) ?? [];
      return {
        ...assistantComplete,
        content: update?.content ?? "",
      };
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: {
        response: "I refreshed the current CV draft for this role.",
        resumePatch: {
          tailoredSummary: "Sharper summary",
          tailoredHeadline: "Demand Planner",
          tailoredSkills: [{ name: "Planning", keywords: ["forecasting"] }],
        },
      },
    });

    const result = await sendMessageForJob({
      jobId: "job-1",
      content: "Update my CV for this role",
    });

    expect(mocks.jobs.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        tailoredSummary: "Sharper summary",
        tailoredHeadline: "Demand Planner",
        tailoredSkills: JSON.stringify([
          { name: "Planning", keywords: ["forecasting"] },
        ]),
      }),
    );

    const parsed = parseGhostwriterAssistantContent(
      result.assistantMessage?.content ?? "",
    );
    expect(parsed.response).toBe(
      "I refreshed the current CV draft for this role.",
    );
    expect(parsed.resumePatch).toEqual({
      tailoredSummary: "Sharper summary",
      tailoredHeadline: "Demand Planner",
      tailoredSkills: [{ name: "Planning", keywords: ["forecasting"] }],
    });
  });

  it("drops obviously overclaiming resumePatch fields before updating the job", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-overclaiming",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-overclaiming",
      status: "complete",
      content: "",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockImplementation(async (_id, update) => ({
      ...assistantComplete,
      content: update.content ?? "",
      tokensIn: update.tokensIn ?? null,
      tokensOut: update.tokensOut ?? null,
    }));
    mocks.repo.getMessageById.mockImplementation(async () => {
      const [, update] = mocks.repo.updateMessage.mock.calls.at(-1) ?? [];
      return {
        ...assistantComplete,
        content: update?.content ?? "",
      };
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: {
        response: "I refreshed the current CV draft for this role.",
        resumePatch: {
          tailoredSummary:
            "Senior leader with 10+ years driving enterprise-wide planning transformation.",
          tailoredHeadline: "Head of Supply Chain Planning",
          tailoredSkills: [
            { name: "Planning", keywords: ["forecasting"] },
            { name: "SAP IBP", keywords: ["global ownership"] },
          ],
        },
      },
    });

    await sendMessageForJob({
      jobId: "job-1",
      content: "Update my CV for this role",
    });

    expect(mocks.jobs.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        tailoredSummary: undefined,
        tailoredHeadline: undefined,
        tailoredSkills: JSON.stringify([
          { name: "Planning", keywords: ["forecasting"] },
        ]),
      }),
    );
  });

  it("drops low-overlap resumePatch fields that do not match profile evidence", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-low-overlap",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-low-overlap",
      status: "complete",
      content: "",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockImplementation(async (_id, update) => ({
      ...assistantComplete,
      content: update.content ?? "",
      tokensIn: update.tokensIn ?? null,
      tokensOut: update.tokensOut ?? null,
    }));
    mocks.repo.getMessageById.mockImplementation(async () => {
      const [, update] = mocks.repo.updateMessage.mock.calls.at(-1) ?? [];
      return {
        ...assistantComplete,
        content: update?.content ?? "",
      };
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: {
        response: "I refreshed the current CV draft for this role.",
        resumePatch: {
          tailoredSummary:
            "Pharmaceutical regulatory commercialization specialist for late-stage market access programs.",
          tailoredHeadline: "Regulatory Commercialization Specialist",
          tailoredSkills: [
            {
              name: "Market Access",
              keywords: ["regulatory strategy", "commercial launch"],
            },
          ],
        },
      },
    });

    await sendMessageForJob({
      jobId: "job-1",
      content: "Update my CV for this role",
    });

    expect(mocks.jobs.updateJob).not.toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        tailoredSummary:
          "Pharmaceutical regulatory commercialization specialist for late-stage market access programs.",
      }),
    );
    expect(mocks.jobs.updateJob).not.toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        tailoredHeadline: "Regulatory Commercialization Specialist",
      }),
    );
  });

  it("normalizes looser payload shapes instead of failing the request", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-loose",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-loose",
      status: "complete",
      content: "",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockImplementation(async (_id, update) => ({
      ...assistantComplete,
      content: update.content ?? "",
    }));
    mocks.repo.getMessageById.mockImplementation(async () => {
      const [, update] = mocks.repo.updateMessage.mock.calls.at(-1) ?? [];
      return {
        ...assistantComplete,
        content: update?.content ?? "",
      };
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: {
        content: "Here is a stronger draft.",
        draft: "Dear Team,\n\nThis is the letter body.",
        resumePatch: {
          summary:
            "Planning-oriented analytical profile with Python and Excel decision support.",
        },
      },
    });

    const result = await sendMessageForJob({
      jobId: "job-1",
      content: "Rewrite this for me",
    });

    const parsed = parseGhostwriterAssistantContent(
      result.assistantMessage?.content ?? "",
    );
    expect(parsed.response).toBe("Here is a stronger draft.");
    expect(parsed.coverLetterDraft).toBe(
      "Dear Team,\n\nThis is the letter body.",
    );
    expect(parsed.resumePatch).toEqual({
      tailoredSummary:
        "Planning-oriented analytical profile with Python and Excel decision support.",
      tailoredHeadline: null,
      tailoredSkills: null,
    });
  });

  it("removes obvious template cover-letter openings before storing the draft", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-cover-letter",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-cover-letter",
      status: "complete",
      content: "",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockImplementation(async (_id, update) => ({
      ...assistantComplete,
      content: update.content ?? "",
    }));
    mocks.repo.getMessageById.mockImplementation(async () => {
      const [, update] = mocks.repo.updateMessage.mock.calls.at(-1) ?? [];
      return {
        ...assistantComplete,
        content: update?.content ?? "",
      };
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: {
        response: "I drafted a sharper cover letter.",
        coverLetterDraft:
          "I am writing to express my interest in this role. I recently worked on planning-oriented analysis with Python and Excel, translating operational data into decision-ready materials. That mix of structured analysis and practical business support is why this role feels relevant to me. I would be glad to contribute that mindset to your team.",
        coverLetterKind: "letter",
      },
    });

    const result = await sendMessageForJob({
      jobId: "job-1",
      content: "Write a cover letter for this role",
    });

    const parsed = parseGhostwriterAssistantContent(
      result.assistantMessage?.content ?? "",
    );
    expect(parsed.coverLetterDraft).not.toContain(
      "I am writing to express my interest",
    );
    expect(parsed.coverLetterDraft).toContain(
      "I recently worked on planning-oriented analysis",
    );
  });

  it("keeps short cover letter drafts intact instead of over-cleaning them", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-short-cover-letter",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-short-cover-letter",
      status: "complete",
      content: "",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockImplementation(async (_id, update) => ({
      ...assistantComplete,
      content: update.content ?? "",
    }));
    mocks.repo.getMessageById.mockImplementation(async () => {
      const [, update] = mocks.repo.updateMessage.mock.calls.at(-1) ?? [];
      return {
        ...assistantComplete,
        content: update?.content ?? "",
      };
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: {
        response: "I drafted a short application email.",
        coverLetterDraft:
          "I am excited to apply for this role. My background in planning-oriented analysis and reporting would let me contribute quickly.",
        coverLetterKind: "email",
      },
    });

    const result = await sendMessageForJob({
      jobId: "job-1",
      content: "Write a short application email",
    });

    const parsed = parseGhostwriterAssistantContent(
      result.assistantMessage?.content ?? "",
    );
    expect(parsed.coverLetterDraft).toContain(
      "I am excited to apply for this role.",
    );
  });

  it("rejects empty message content", async () => {
    await expect(
      sendMessage({
        jobId: "job-1",
        threadId: "thread-1",
        content: "   ",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("cancels a running generation during streaming", async () => {
    vi.useFakeTimers();

    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-stream",
      content: "",
      status: "partial",
    };
    const assistantCancelled: JobChatMessage = {
      ...assistantPartial,
      status: "cancelled",
      content: "",
    };
    let cancelPromise: Promise<{
      cancelled: boolean;
      alreadyFinished: boolean;
    }> | null = null;

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantCancelled);
    mocks.repo.getMessageById.mockResolvedValue(assistantCancelled);
    mocks.repo.getRunById.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      status: "running",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: null,
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.llmCallJson.mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(1);
      return {
        success: true,
        data: { response: "x".repeat(200) },
      };
    });

    const onReady = vi.fn(({ runId }: { runId: string }) => {
      cancelPromise = cancelRunForJob({ jobId: "job-1", runId });
    });
    const onCancelled = vi.fn();
    const onCompleted = vi.fn();

    const resultPromise = sendMessageForJob({
      jobId: "job-1",
      content: "Cancel this",
      stream: {
        onReady,
        onDelta: vi.fn(),
        onCompleted,
        onCancelled,
        onError: vi.fn(),
      },
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;
    await cancelPromise;

    expect(onReady).toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(result.assistantMessage?.status).toBe("cancelled");
  });

  it("regenerates any assistant message, not just the latest", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-regen",
      content: "",
      status: "partial",
      parentMessageId: "user-1",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-regen",
      content: "Thanks for your question.",
      status: "complete",
      parentMessageId: "user-1",
    };

    mocks.repo.getMessageById
      .mockResolvedValueOnce(baseAssistantMessage) // target lookup
      .mockResolvedValueOnce(baseUserMessage) // parent user lookup
      .mockResolvedValueOnce(assistantComplete); // final lookup after run

    mocks.repo.getAncestorPath.mockResolvedValue([baseUserMessage]);
    mocks.repo.createMessage.mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);

    const result = await regenerateMessage({
      jobId: "job-1",
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
    });

    expect(result.runId).toBe("run-1");
    expect(result.assistantMessage?.id).toBe("assistant-regen");
    expect(mocks.repo.setActiveChild).toHaveBeenCalledWith(
      "user-1",
      "assistant-regen",
    );
  });

  it("returns alreadyFinished when cancelling non-running run", async () => {
    mocks.repo.getRunById.mockResolvedValue({
      id: "run-finished",
      threadId: "thread-1",
      jobId: "job-1",
      status: "completed",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: Date.now(),
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await cancelRun({
      jobId: "job-1",
      threadId: "thread-1",
      runId: "run-finished",
    });

    expect(result).toEqual({ cancelled: false, alreadyFinished: true });
    expect(mocks.repo.completeRun).not.toHaveBeenCalled();
    expect(mocks.repo.completeRunIfRunning).not.toHaveBeenCalled();
  });

  it("returns alreadyFinished when run completes before cancel write", async () => {
    mocks.repo.getRunById.mockResolvedValue({
      id: "run-race",
      threadId: "thread-1",
      jobId: "job-1",
      status: "running",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: null,
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.repo.completeRunIfRunning.mockResolvedValue({
      id: "run-race",
      threadId: "thread-1",
      jobId: "job-1",
      status: "completed",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: Date.now(),
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await cancelRun({
      jobId: "job-1",
      threadId: "thread-1",
      runId: "run-race",
    });

    expect(result).toEqual({ cancelled: false, alreadyFinished: true });
  });

  it("maps createRun unique constraint races to conflict", async () => {
    mocks.repo.createMessage.mockResolvedValue(baseUserMessage);
    mocks.repo.createRun.mockRejectedValue(
      new Error(
        "UNIQUE constraint failed: job_chat_runs.thread_id (idx_job_chat_runs_thread_running_unique)",
      ),
    );

    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "hello",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
  });
});
