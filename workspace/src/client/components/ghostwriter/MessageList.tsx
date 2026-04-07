import type { BranchInfo, JobChatMessage } from "@shared/types";
import { parseGhostwriterAssistantContent } from "@shared/utils/ghostwriter";
import { Check, Copy, Pencil, RefreshCcw } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BranchNavigator } from "./BranchNavigator";
import { StreamingMessage } from "./StreamingMessage";

type MessageListProps = {
  messages: JobChatMessage[];
  branches: BranchInfo[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  onRegenerate: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onSwitchBranch: (messageId: string) => void;
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  branches,
  isStreaming,
  streamingMessageId,
  onRegenerate,
  onEdit,
  onSwitchBranch,
}) => {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  const branchMap = new Map<string, BranchInfo>();
  for (const branch of branches) {
    branchMap.set(branch.messageId, branch);
  }

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
    <div className="space-y-4 py-4">
      {messages.length > 0 &&
        messages.map((message) => {
          const isUser = message.role === "user";
          const isActiveStreaming =
            isStreaming &&
            message.role === "assistant" &&
            streamingMessageId === message.id;
          const isEditing = editingMessageId === message.id;
          const canCopyResponse =
            message.role === "assistant" &&
            message.status === "complete" &&
            !isStreaming &&
            !isActiveStreaming;
          const branch = branchMap.get(message.id);

          return (
            <div
              key={message.id}
              className={`group rounded-[24px] border p-4 shadow-sm transition ${
                isUser
                  ? "border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#f4fbf7_100%)]"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${isUser ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {isUser ? "You" : "Ghostwriter"}
                </span>
                {branch && (
                  <BranchNavigator
                    branchInfo={branch}
                    onSwitch={onSwitchBranch}
                  />
                )}
                <div className="ml-auto flex items-center gap-1 opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
                  {isUser && !isStreaming && !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEditing(message)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit message"
                      title="Edit message"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {!isUser && !isStreaming && !isActiveStreaming && (
                    <>
                      {canCopyResponse ? (
                        <button
                          type="button"
                          onClick={() =>
                            void copyMessage(message.id, message.content)
                          }
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          aria-label="Copy response"
                          title="Copy response"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>
                            {copiedMessageId === message.id ? "Copied" : "Copy"}
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRegenerate(message.id)}
                        className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Regenerate response"
                        title="Regenerate response"
                      >
                        <RefreshCcw className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        cancelEditing();
                      }
                    }}
                    className="min-h-[60px] rounded-2xl border-slate-200 bg-white"
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
              ) : message.role === "assistant" ? (
                (() => {
                  const parsed = parseGhostwriterAssistantContent(message.content);
                  return (
                    <div className="space-y-3">
                      <div className="text-[15px] leading-7 text-slate-700 [&_a]:text-emerald-700 [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_h1]:mt-4 [&_h1]:font-serif [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:text-slate-100 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                        <ReactMarkdown>
                          {parsed.response || "..."}
                        </ReactMarkdown>
                      </div>

                      {parsed.fitBrief && (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                          <div className="mb-2 font-medium text-foreground/90">Fit brief</div>
                          {parsed.fitBrief.strongestPoints.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Strongest points</div>
                              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                {parsed.fitBrief.strongestPoints.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {parsed.fitBrief.risks.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Watchouts</div>
                              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                {parsed.fitBrief.risks.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {parsed.runtimePlan && (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="font-medium text-foreground/90">Runtime plan</div>
                            <div className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {parsed.runtimePlan.taskKind}
                            </div>
                          </div>
                          <div className="text-muted-foreground">{parsed.runtimePlan.deliverable}</div>
                          {parsed.runtimePlan.selectedTools.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {parsed.runtimePlan.selectedTools.map((tool) => (
                                <span key={tool} className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-foreground/80">
                                  {tool}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {parsed.evidenceSelection && (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                          <div className="mb-2 font-medium text-foreground/90">Evidence used</div>
                          {parsed.evidenceSelection.leadModuleLabel ? (
                            <div className="mb-2 text-muted-foreground">
                              <span className="font-medium text-foreground/80">Lead proof point:</span>{" "}
                              {parsed.evidenceSelection.leadModuleLabel}
                            </div>
                          ) : null}
                          {parsed.evidenceSelection.allowedModuleLabels.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Allowed modules</div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {parsed.evidenceSelection.allowedModuleLabels.map((label) => (
                                  <span key={label} className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-foreground/80">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {parsed.evidenceSelection.blockedClaims.length > 0 && (
                            <div className="text-muted-foreground">
                              <span className="font-medium text-foreground/80">Blocked claims:</span>{" "}
                              {parsed.evidenceSelection.blockedClaims.slice(0, 3).join(" · ")}
                            </div>
                          )}
                        </div>
                      )}

                      {parsed.executionTrace && parsed.executionTrace.length > 0 && (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                          <div className="mb-2 font-medium text-foreground/90">Execution trace</div>
                          <div className="space-y-2">
                            {parsed.executionTrace.map((step) => (
                              <div key={`${step.stage}-${step.summary}`} className="rounded border border-border/50 bg-background/60 p-2">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{step.stage}</div>
                                <div className="mt-1 text-muted-foreground">{step.summary}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {parsed.toolTrace && parsed.toolTrace.length > 0 && (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                          <div className="mb-2 font-medium text-foreground/90">Tool trace</div>
                          <div className="space-y-2">
                            {parsed.toolTrace.slice(0, 4).map((tool) => (
                              <div key={`${tool.name}-${tool.purpose}`} className="rounded border border-border/50 bg-background/60 p-2">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tool.name}</div>
                                <div className="mt-1 font-medium text-foreground/90">{tool.purpose}</div>
                                <div className="mt-1 whitespace-pre-wrap text-muted-foreground line-clamp-4">{tool.output}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {message.content}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};
