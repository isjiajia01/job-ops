import type { Job } from "@shared/types";
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
import { useConversationActions } from "./useConversationActions";

type GhostwriterPanelProps = {
  job: Job;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({ job }) => {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [composerValue, setComposerValue] = useState("");

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const {
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

  const suggestionPrompts = [
    "Score my fit for this role",
    "Rewrite my strongest bullets for this JD",
    "Draft a sharper cover letter opening",
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/60 bg-background shadow-sm">
      <div className="border-b border-border/60 bg-background/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              Ghostwriter
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {job.title} · {job.employer}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {isStreaming
              ? "Drafting…"
              : messages.length
                ? "Conversation loaded"
                : "Ready"}
          </div>
        </div>
      </div>

      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex min-h-[320px] flex-col justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-6 text-left">
            <div className="max-w-2xl rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm">
              <div className="text-sm font-medium text-foreground">Ghostwriter</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                I already have this job description and your saved profile context. Ask me to draft a cover letter, rewrite CV bullets, or assess fit for this role.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {suggestionPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setComposerValue(prompt)}
                    className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 transition-colors hover:bg-muted"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
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

      <div className="border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur">
        <Composer
          disabled={isLoading || isStreaming}
          isStreaming={isStreaming}
          canReset={canReset}
          value={composerValue}
          onValueChange={setComposerValue}
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
