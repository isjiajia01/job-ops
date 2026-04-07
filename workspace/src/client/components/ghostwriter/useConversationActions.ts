import * as api from "@client/api";
import type {
  BranchInfo,
  Job,
  JobChatMessage,
  JobChatStreamEvent,
} from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type UseConversationActionsArgs = {
  job: Job;
};

export function useConversationActions({ job }: UseConversationActionsArgs) {
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    const data = await api.listApplicationGhostwriterMessages(job.id, {
      limit: 300,
    });
    setMessages(data.messages);
    setBranches(data.branches);
  }, [job.id]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadMessages();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load Ghostwriter";
      toast.error(message);
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
          if (current.some((message) => message.id === event.messageId)) {
            return current;
          }
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
              ? {
                  ...message,
                  content: `${message.content}${event.delta}`,
                  status: "partial",
                  updatedAt: new Date().toISOString(),
                }
              : message,
          ),
        );
        return;
      }

      if (event.type === "completed" || event.type === "cancelled") {
        setMessages((current) => {
          const next = current.filter(
            (message) => message.id !== event.message.id,
          );
          return [...next, event.message].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
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

  const sendMessage = useCallback(
    async (content: string) => {
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
        await api.streamApplicationGhostwriterMessage(
          job.id,
          { content, signal: controller.signal },
          { onEvent: onStreamEvent },
        );

        await loadMessages();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error(message);
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, job.id, loadMessages, messages, onStreamEvent],
  );

  const stopStreaming = useCallback(async () => {
    if (!activeRunId) return;
    try {
      await api.cancelApplicationGhostwriterRun(job.id, activeRunId);
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setIsStreaming(false);
      setActiveRunId(null);
      setStreamingMessageId(null);
      await loadMessages();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to stop run";
      toast.error(message);
    }
  }, [activeRunId, job.id, loadMessages]);

  const regenerate = useCallback(
    async (assistantMessageId: string) => {
      if (isStreaming) return;

      setMessages((current) => {
        const targetIndex = current.findIndex(
          (message) => message.id === assistantMessageId,
        );
        if (targetIndex === -1) return current;
        return current.slice(0, targetIndex);
      });

      setIsStreaming(true);
      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.streamRegenerateApplicationGhostwriterMessage(
          job.id,
          assistantMessageId,
          { signal: controller.signal },
          { onEvent: onStreamEvent },
        );
        await loadMessages();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Failed to regenerate response";
        toast.error(message);
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, job.id, loadMessages, onStreamEvent],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (isStreaming) return;

      setMessages((current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) return current;
        const before = current.slice(0, targetIndex);
        return [
          ...before,
          {
            id: `tmp-edit-${Date.now()}`,
            threadId: current[0]?.threadId || "pending-thread",
            jobId: job.id,
            role: "user" as const,
            content,
            status: "complete" as const,
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

      setIsStreaming(true);
      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.editApplicationGhostwriterMessage(
          job.id,
          messageId,
          { content, signal: controller.signal },
          { onEvent: onStreamEvent },
        );
        await loadMessages();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to edit message";
        toast.error(message);
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, job.id, loadMessages, onStreamEvent],
  );

  const switchBranch = useCallback(
    async (messageId: string) => {
      try {
        const result = await api.switchApplicationGhostwriterBranch(
          job.id,
          messageId,
        );
        setMessages(result.messages);
        setBranches(result.branches);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to switch branch";
        toast.error(message);
      }
    },
    [job.id],
  );

  const resetConversation = useCallback(async () => {
    try {
      await api.resetApplicationGhostwriterConversation(job.id);
      setMessages([]);
      setBranches([]);
      toast.success("Conversation cleared");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset conversation";
      toast.error(message);
    }
  }, [job.id]);

  return {
    branches,
    editMessage,
    isLoading,
    isStreaming,
    messages,
    regenerate,
    resetConversation,
    sendMessage,
    stopStreaming,
    streamingMessageId,
    switchBranch,
  };
}
