import * as api from "@client/api";
import type { Job, JobChatMessage, JobChatStreamEvent } from "@shared/types";
import { getGhostwriterCoverLetterDraft } from "@shared/utils/ghostwriter";
import { ChevronRight, Download, FileText } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "../discovered-panel/CollapsibleSection";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { AI_ENTRY_PROMPTS, COVER_LETTER_PROMPTS } from "./prompt-presets";

type GhostwriterPanelProps = {
  job: Job;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({ job }) => {
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [cvActionsOpen, setCvActionsOpen] = useState(false);
  const [coverActionsOpen, setCoverActionsOpen] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120 || isStreaming) {
      container.scrollTop = container.scrollHeight;
    }
  });

  const loadMessages = useCallback(async () => {
    const data = await api.listJobGhostwriterMessages(job.id, {
      limit: 300,
    });
    setMessages(data.messages);
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, optimisticUser]);
      setIsStreaming(true);

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.streamJobGhostwriterMessage(
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
      await api.cancelJobGhostwriterRun(job.id, activeRunId);
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

  const canRegenerate = useMemo(() => {
    if (isStreaming || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "assistant";
  }, [isStreaming, messages]);

  const latestAssistantMessage = useMemo(() => {
    return [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
  }, [messages]);

  const downloadLatestCoverLetter = useCallback(() => {
    const content = latestAssistantMessage
      ? getGhostwriterCoverLetterDraft(latestAssistantMessage.content)
      : "";
    if (!content) return;

    const safeEmployer = (job.employer || "employer")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const safeTitle = (job.title || "job")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cover-letter-${safeEmployer}-${safeTitle}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [job.employer, job.title, latestAssistantMessage]);

  const triggerQuickPrompt = useCallback(
    async (prompt: string) => {
      await sendMessage(prompt);
    },
    [sendMessage],
  );

  const composerPlaceholder =
    "Ask anything about this job, your CV, or the cover letter...";

  const regenerate = useCallback(async () => {
    if (isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;

    setIsStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      await api.streamRegenerateJobGhostwriterMessage(
        job.id,
        last.id,
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
  }, [isStreaming, job.id, loadMessages, messages, onStreamEvent]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              Ask AI Copilot
            </div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              Ask in normal Q&A form. It already has this job description, your
              CV context, and your shared profile knowledge.
            </div>
          </div>
          {latestAssistantMessage &&
          getGhostwriterCoverLetterDraft(
            latestAssistantMessage.content,
          ).trim() ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
              >
                <a
                  href={`/job/${job.id}/cover-letter`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Letter
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={downloadLatestCoverLetter}
              >
                <Download className="h-3.5 w-3.5" />
                Draft
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto border-b border-border/50 pb-3 pr-1"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full min-h-[260px] justify-center px-3 flex-col text-left">
            <h4 className="font-medium">
              {job.title} at {job.employer}
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ask a question, request a rewrite, update the CV for this role, or
              draft a cover letter. Quick actions are available below if you
              want them.
            </p>
          </div>
        ) : (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
          />
        )}
      </div>

      <div className="mt-4 space-y-3">
        <CollapsibleSection
          isOpen={quickActionsOpen}
          label="Quick Actions"
          onToggle={() => setQuickActionsOpen((current) => !current)}
        >
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-3">
            <CollapsibleSection
              isOpen={cvActionsOpen}
              label="CV Actions"
              onToggle={() => setCvActionsOpen((current) => !current)}
            >
              <div className="grid gap-2 pt-1">
                {AI_ENTRY_PROMPTS.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    size="sm"
                    className="justify-between gap-3 text-left"
                    disabled={isLoading || isStreaming}
                    onClick={() => void triggerQuickPrompt(item.prompt)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  </Button>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              isOpen={coverActionsOpen}
              label="Cover Letter Actions"
              onToggle={() => setCoverActionsOpen((current) => !current)}
            >
              <div className="grid gap-2 pt-1">
                {COVER_LETTER_PROMPTS.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    size="sm"
                    className="justify-between gap-3 text-left"
                    disabled={isLoading || isStreaming}
                    onClick={() => void triggerQuickPrompt(item.prompt)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  </Button>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        </CollapsibleSection>

        <Composer
          disabled={isLoading || isStreaming}
          isStreaming={isStreaming}
          canRegenerate={canRegenerate}
          placeholder={composerPlaceholder}
          onRegenerate={regenerate}
          onStop={stopStreaming}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
};
