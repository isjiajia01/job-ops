import type { Job } from "@shared/types";
import { parseGhostwriterAssistantContent } from "@shared/utils/ghostwriter";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { RuntimeInspector } from "./RuntimeInspector";
import { useConversationActions } from "./useConversationActions";

type GhostwriterPanelProps = {
  job: Job;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({ job }) => {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const {
    activeRunId,
    branches,
    editMessage,
    isLoading,
    isStreaming,
    messages,
    regenerate,
    resetConversation,
    runTimeline,
    runs,
    selectRun,
    selectedRunId,
    sendMessage,
    stopStreaming,
    streamingMessageId,
    switchBranch,
  } = useConversationActions({ job });

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120 || isStreaming) {
      container.scrollTop = container.scrollHeight;
    }
  });

  const canReset = useMemo(() => {
    return !isStreaming && messages.length > 0;
  }, [isStreaming, messages]);

  const currentRuntime = useMemo(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find(
        (message) => message.role === "assistant" && message.status === "complete",
      );
    if (!latestAssistant) return null;
    const parsed = parseGhostwriterAssistantContent(latestAssistant.content);
    if (!parsed.runtimePlan && !parsed.fitBrief && !parsed.executionTrace) return null;
    return parsed;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbfa_0%,#f4f7f6_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Application writer
            </div>
            <h3 className="mt-2 font-serif text-2xl text-slate-900">
              {job.title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{job.employer} · Ghostwriter keeps fit analysis, runtime decisions, and drafting in one workspace.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 text-right shadow-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Current mode</div>
            <div className="mt-1 text-sm font-medium text-slate-700">{isStreaming ? "Live drafting" : messages.length ? "Conversation loaded" : "Ready for a new brief"}</div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        <RuntimeInspector
          activeRunId={activeRunId}
          currentRuntime={currentRuntime}
          isStreaming={isStreaming}
          runTimeline={runTimeline}
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={selectRun}
        />
      </div>

      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pr-4"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex min-h-[320px] flex-col justify-center rounded-[24px] border border-dashed border-emerald-200 bg-white/80 px-6 py-8 text-left shadow-sm">
            <div className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">Tailored drafting</div>
            <h4 className="mt-4 font-serif text-3xl text-slate-900">
              Start from the job, not from a blank page.
            </h4>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              Ghostwriter already has this job description, your resume, candidate memory, and writing preferences. Ask for fit scoring, bullet rewrites, cover letters, emails, or sharper CV positioning and it will carry the runtime rationale with it.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
              {[
                "Score my fit for this role",
                "Rewrite my strongest bullets for this JD",
                "Draft a sharper cover letter opening",
              ].map((prompt) => (
                <span key={prompt} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{prompt}</span>
              ))}
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            branches={branches}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
            onRegenerate={regenerate}
            onEdit={editMessage}
            onSwitchBranch={switchBranch}
          />
        )}
      </div>

      <div className="border-t border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur">
        <Composer
          disabled={isLoading || isStreaming}
          isStreaming={isStreaming}
          canReset={canReset}
          onStop={stopStreaming}
          onSend={sendMessage}
          onReset={() => setIsResetDialogOpen(true)}
        />
      </div>

      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently erase the entire conversation. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void resetConversation()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Erase conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
