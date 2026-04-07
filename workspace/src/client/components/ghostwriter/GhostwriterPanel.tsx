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
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <RuntimeInspector
        activeRunId={activeRunId}
        currentRuntime={currentRuntime}
        isStreaming={isStreaming}
        runTimeline={runTimeline}
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={selectRun}
      />

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
              Ghostwriter already has this job description, your resume, and
              your writing preferences. Start with things like “score my fit for
              this role”, “rewrite my strongest bullets for this JD”, or
              “draft a sharper cover letter opening”.
            </p>
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

      <div className="mt-4">
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
