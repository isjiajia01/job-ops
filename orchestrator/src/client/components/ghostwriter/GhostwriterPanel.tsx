import * as api from "@client/api";
import { parseDocumentStrategy } from "@/client/lib/document-strategy";
import { queryKeys } from "@/client/lib/queryKeys";
import {
  buildGhostwriterQuickActions,
  buildGhostwriterSuggestedPrompts,
} from "./panel-actions";
import { buildGhostwriterSeedPrompt, getSelectedProofPoints } from "./panel-context";
import type { GhostwriterResumePatch, Job, JobChatMessage } from "@shared/types";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { WritingContextPreview } from "./WritingContextPreview";
import { useConversationActions } from "./useConversationActions";

type GhostwriterPanelProps = {
  job: Job;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({ job }) => {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const {
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

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.profile.knowledge(),
    queryFn: api.getCandidateKnowledgeBase,
  });

  const documentStrategy = useMemo(
    () => parseDocumentStrategy(job),
    [job],
  );
  const selectedProofPoints = useMemo(
    () => getSelectedProofPoints(job, knowledgeQuery.data?.projects ?? []),
    [job, knowledgeQuery.data],
  );
  const strategyPrompt = useMemo(
    () => buildGhostwriterSeedPrompt({ job, projects: knowledgeQuery.data?.projects ?? [] }),
    [job, knowledgeQuery.data],
  );

  const handleTurnIntoCoverLetter = useCallback(
    async (message: JobChatMessage) => {
      await sendMessage(
        `Turn your previous response into a polished cover letter for this job. Keep the same strongest evidence and align it with the current job strategy if relevant.`,
      );
    },
    [sendMessage],
  );

  const handleApplyResumePatch = useCallback(
    async (patch: GhostwriterResumePatch) => {
      await applyResumePatch(patch);
    },
    [applyResumePatch],
  );

  const quickActions = useMemo(
    () => buildGhostwriterQuickActions(documentStrategy),
    [documentStrategy],
  );

  const suggestedPrompts = useMemo(() => buildGhostwriterSuggestedPrompts(), []);


  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-[28px] border border-stone-200/80 bg-[#fcfaf6] shadow-[0_20px_60px_rgba(120,98,68,0.08)] dark:border-border/50 dark:bg-card/60 dark:shadow-none">
      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto border-b border-stone-200/70 px-4 pb-4 pt-5 dark:border-border/50"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex min-h-[320px] h-full flex-col justify-center px-5 text-left">
            <div className="mb-3 inline-flex w-fit items-center rounded-full border border-stone-200 bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-stone-500 shadow-sm dark:border-border dark:bg-muted/40 dark:text-muted-foreground">
              Ghostwriter
            </div>
            <h4 className="font-medium text-stone-900 dark:text-foreground">
              {job.title} at {job.employer}
            </h4>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600 dark:text-muted-foreground">
              Ghostwriter already has this job description, your resume, and your writing preferences. Start with a suggested prompt or ask for a sharper application draft.
            </p>
            <div className="mt-5 flex max-w-2xl flex-wrap gap-2">
              {suggestedPrompts.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => void sendMessage(item.prompt)}
                  className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted/50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            branches={branches}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
            selectedProofPoints={selectedProofPoints}
            onRegenerate={regenerate}
            onEdit={editMessage}
            onSwitchBranch={switchBranch}
            onTurnIntoCoverLetter={handleTurnIntoCoverLetter}
            onApplyResumePatch={handleApplyResumePatch}
          />
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        <WritingContextPreview
          documentStrategy={documentStrategy}
          selectedProofPoints={selectedProofPoints}
          onUseProofPointsInPrompt={() => {
            void sendMessage(
              "Use the currently selected proof points for this job as the main evidence base. Tell me whether they are strong enough for this application and, if not, what is missing.",
            );
          }}
        />

        <Composer
          disabled={isLoading || isStreaming}
          isStreaming={isStreaming}
          canReset={canReset}
          strategyPrompt={strategyPrompt}
          quickActions={quickActions}
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
