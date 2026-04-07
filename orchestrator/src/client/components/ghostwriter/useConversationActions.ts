import * as api from "@client/api";
import type {
  BranchInfo,
  GhostwriterResumePatch,
  Job,
  JobChatMessage,
  JobChatStreamEvent,
} from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Args = {
  job: Job;
};

export function useConversationActions({ job }: Args) {
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    const data = await api.listJobGhostwriterMessages(job.id, { limit: 300 });
    setMessages(data.messages);
    setBranches(data.branches);
  }, [job.id]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Ghostwriter");
    } finally {
      setIsLoading(false);
    }
  }, [loadMessages]);

  useEffect(() => {
    void load();
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, [load]);

  const onStreamEvent = useCallback(
    (event: JobChatStreamEvent) => {
      if (event.type === "ready") {
        setActiveRunId(event.runId);
        setStreamingMessageId(event.messageId);
        setMessages((current) => {
          if (current.some((message) => message.id === event.messageId)) return current;
          return [
            ...current,
            {
              id: event.messageId,
              threadId: event.threadId,
              jobId: job.id,
              role: "assistant",
              content: "",
              status: "partial",
              tokensIn: null,
              tokensOut: null,
              version: 1,
              replacesMessageId: null,
              parentMessageId: null,
              activeChildId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
        });
        return;
      }
      if (event.type === "delta") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, content: `${message.content}${event.delta}`, status: "partial", updatedAt: new Date().toISOString() }
              : message,
          ),
        );
        return;
      }
      if (event.type === "completed" || event.type === "cancelled") {
        setMessages((current) => {
          const next = current.filter((message) => message.id !== event.message.id);
          return [...next, event.message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        setStreamingMessageId(null);
        setActiveRunId(null);
        setIsStreaming(false);
        return;
      }
      if (event.type === "error") {
        toast.error(event.message);
        setStreamingMessageId(null);
        setActiveRunId(null);
        setIsStreaming(false);
      }
    },
    [job.id],
  );

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming) return;
    const optimisticUser: JobChatMessage = {
      id: `tmp-user-${Date.now()}`,
      threadId: messages[messages.length - 1]?.threadId || "pending-thread",
      jobId: job.id,
      role: "user",
      content,
      status: "complete",
      tokensIn: null,
      tokensOut: null,
      version: 1,
      replacesMessageId: null,
      parentMessageId: null,
      activeChildId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticUser]);
    setIsStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;
    try {
      await api.streamJobGhostwriterMessage(job.id, { content, signal: controller.signal }, { onEvent: onStreamEvent });
      await loadMessages();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Failed to send message");
      }
    } finally {
      streamAbortRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, job.id, loadMessages, messages, onStreamEvent]);

  const stopStreaming = useCallback(async () => {
    if (!activeRunId) return;
    try {
      await api.cancelJobGhostwriterRun(job.id, activeRunId);
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setIsStreaming(false);
      setActiveRunId(null);
      setStreamingMessageId(null);
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stop run");
    }
  }, [activeRunId, job.id, loadMessages]);

  const regenerate = useCallback(async (assistantMessageId: string) => {
    if (isStreaming) return;
    setMessages((current) => {
      const targetIndex = current.findIndex((m) => m.id === assistantMessageId);
      return targetIndex === -1 ? current : current.slice(0, targetIndex);
    });
    setIsStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;
    try {
      await api.streamRegenerateJobGhostwriterMessage(job.id, assistantMessageId, { signal: controller.signal }, { onEvent: onStreamEvent });
      await loadMessages();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Failed to regenerate response");
      }
    } finally {
      streamAbortRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, job.id, loadMessages, onStreamEvent]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (isStreaming) return;
    setMessages((current) => {
      const targetIndex = current.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return current;
      const before = current.slice(0, targetIndex);
      return [...before, {
        id: `tmp-edit-${Date.now()}`,
        threadId: current[0]?.threadId || "pending-thread",
        jobId: job.id,
        role: "user",
        content,
        status: "complete",
        tokensIn: null,
        tokensOut: null,
        version: 1,
        replacesMessageId: null,
        parentMessageId: null,
        activeChildId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
    });
    setIsStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;
    try {
      await api.editJobGhostwriterMessage(job.id, messageId, { content, signal: controller.signal }, { onEvent: onStreamEvent });
      await loadMessages();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Failed to edit message");
      }
    } finally {
      streamAbortRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, job.id, loadMessages, onStreamEvent]);

  const switchBranch = useCallback(async (messageId: string) => {
    try {
      const result = await api.switchJobGhostwriterBranch(job.id, messageId);
      setMessages(result.messages);
      setBranches(result.branches);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to switch branch");
    }
  }, [job.id]);

  const resetConversation = useCallback(async () => {
    try {
      await api.resetJobGhostwriterConversation(job.id);
      setMessages([]);
      setBranches([]);
      toast.success("Conversation cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset conversation");
    }
  }, [job.id]);

  const applyResumePatch = useCallback(async (patch: GhostwriterResumePatch) => {
    try {
      await api.updateJob(job.id, {
        ...(patch.tailoredSummary !== null ? { tailoredSummary: patch.tailoredSummary } : {}),
        ...(patch.tailoredHeadline !== null ? { tailoredHeadline: patch.tailoredHeadline } : {}),
        ...(patch.tailoredSkills !== null ? { tailoredSkills: JSON.stringify(patch.tailoredSkills) } : {}),
      });
      toast.success("Applied CV patch to this job draft");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply CV patch");
    }
  }, [job.id]);

  return {
    messages,
    branches,
    isLoading,
    isStreaming,
    streamingMessageId,
    sendMessage,
    stopStreaming,
    regenerate,
    editMessage,
    switchBranch,
    resetConversation,
    applyResumePatch,
  };
}
