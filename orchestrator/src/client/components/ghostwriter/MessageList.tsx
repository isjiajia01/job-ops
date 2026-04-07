import type {
  BranchInfo,
  CandidateKnowledgeProject,
  GhostwriterResumePatch,
  JobChatMessage,
} from "@shared/types";
import { parseGhostwriterAssistantContent } from "@shared/utils/ghostwriter";
import { Pencil } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AssistantMessageCard } from "./AssistantMessageCard";
import { BranchNavigator } from "./BranchNavigator";
import { StreamingMessage } from "./StreamingMessage";

type MessageListProps = {
  messages: JobChatMessage[];
  branches: BranchInfo[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  selectedProofPoints?: CandidateKnowledgeProject[];
  onRegenerate: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onSwitchBranch: (messageId: string) => void;
  onTurnIntoCoverLetter?: (message: JobChatMessage) => void;
  onApplyResumePatch?: (patch: GhostwriterResumePatch) => void;
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  branches,
  isStreaming,
  streamingMessageId,
  selectedProofPoints = [],
  onRegenerate,
  onEdit,
  onSwitchBranch,
  onTurnIntoCoverLetter,
  onApplyResumePatch,
}) => {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  const branchMap = new Map<string, BranchInfo>();
  for (const branch of branches) branchMap.set(branch.messageId, branch);

  const selectedProofPointMap = new Map(
    selectedProofPoints.map((project) => [project.id, project] as const),
  );

  const startEditing = (message: JobChatMessage) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const submitEdit = (messageId: string) => {
    const content = editContent.trim();
    if (!content) return;
    onEdit(messageId, content);
    setEditingMessageId(null);
    setEditContent("");
  };

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const copyMessage = async (messageId: string, content: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Copy is not available in this browser context");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId(null);
        copiedTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to copy response";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isAssistant = message.role === "assistant";
        const isActiveStreaming =
          isStreaming && isAssistant && streamingMessageId === message.id;
        const isEditing = editingMessageId === message.id;
        const canCopyResponse =
          isAssistant && message.status === "complete" && !isStreaming;
        const branch = branchMap.get(message.id);
        const parsedAssistant = isAssistant
          ? parseGhostwriterAssistantContent(message.content)
          : null;
        const evidenceUsed = isAssistant
          ? (parsedAssistant?.evidenceUsedProjectIds ?? [])
              .map((id) => selectedProofPointMap.get(id))
              .filter((project): project is CandidateKnowledgeProject => Boolean(project))
          : [];

        return (
          <div
            key={message.id}
            className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div className="w-full max-w-[92%] space-y-2">
              <div
                className={`flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}
              >
                <span className="text-[10px] uppercase tracking-[0.24em] text-stone-400 dark:text-muted-foreground">
                  {isUser ? "You" : "Ghostwriter"}
                </span>
                {branch ? (
                  <BranchNavigator
                    branchInfo={branch}
                    onSwitch={onSwitchBranch}
                  />
                ) : null}
                {isUser && !isStreaming && !isEditing ? (
                  <div className="ml-auto flex items-center gap-1 opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEditing(message)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      aria-label="Edit message"
                      title="Edit message"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                ) : null}
              </div>

              {isEditing ? (
                <div className="space-y-2 rounded-3xl border border-stone-200/80 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(120,98,68,0.06)] dark:border-border/60 dark:bg-background">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelEditing();
                    }}
                    className="min-h-[60px] border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => submitEdit(message.id)}
                      disabled={!editContent.trim()}
                    >
                      Submit
                    </Button>
                  </div>
                </div>
              ) : isActiveStreaming ? (
                <StreamingMessage content={message.content} />
              ) : isAssistant && parsedAssistant ? (
                <AssistantMessageCard
                  message={message}
                  parsedAssistant={parsedAssistant}
                  evidenceUsed={evidenceUsed}
                  canCopyResponse={canCopyResponse}
                  isCopied={copiedMessageId === message.id}
                  onCopy={() => void copyMessage(message.id, message.content)}
                  onTurnIntoCoverLetter={onTurnIntoCoverLetter}
                  onApplyResumePatch={onApplyResumePatch}
                  onRegenerate={onRegenerate}
                />
              ) : (
                <div className="ml-auto whitespace-pre-wrap rounded-[24px] bg-[#df6f3c] px-4 py-3 text-sm leading-relaxed text-white shadow-[0_10px_30px_rgba(207,99,47,0.24)] dark:bg-primary dark:text-primary-foreground">
                  {message.content}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
