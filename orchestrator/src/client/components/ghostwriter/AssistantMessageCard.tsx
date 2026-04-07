import type {
  CandidateKnowledgeProject,
  GhostwriterAssistantPayload,
  GhostwriterResumePatch,
  JobChatMessage,
} from "@shared/types";
import type React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CoverLetterArtifactCard } from "./CoverLetterArtifactCard";
import { EvidenceUsedBlock } from "./EvidenceUsedBlock";
import { ResponseTools } from "./ResponseTools";

type Props = {
  message: JobChatMessage;
  parsedAssistant: GhostwriterAssistantPayload;
  evidenceUsed: CandidateKnowledgeProject[];
  canCopyResponse: boolean;
  isCopied: boolean;
  onCopy: () => void;
  onTurnIntoCoverLetter?: (message: JobChatMessage) => void;
  onApplyResumePatch?: (patch: GhostwriterResumePatch) => void;
  onRegenerate: (messageId: string) => void;
};

export const AssistantMessageCard: React.FC<Props> = ({
  message,
  parsedAssistant,
  evidenceUsed,
  canCopyResponse,
  isCopied,
  onCopy,
  onTurnIntoCoverLetter,
  onApplyResumePatch,
  onRegenerate,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="ml-auto flex items-center gap-1 opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
          <ResponseTools
            canCopy={canCopyResponse}
            isCopied={isCopied}
            hasCoverLetterDraft={Boolean(parsedAssistant.coverLetterDraft)}
            hasResumePatch={Boolean(parsedAssistant.resumePatch)}
            onCopy={onCopy}
            onTurnIntoCoverLetter={() => onTurnIntoCoverLetter?.(message)}
            onApplyResumePatch={() => {
              if (parsedAssistant.resumePatch) onApplyResumePatch?.(parsedAssistant.resumePatch);
            }}
            onRegenerate={() => onRegenerate(message.id)}
          />
        </div>
      </div>
      <div className="rounded-[26px] border border-stone-200/80 bg-white px-5 py-4 text-[15px] leading-7 text-stone-800 shadow-[0_10px_30px_rgba(120,98,68,0.06)] dark:border-border/60 dark:bg-background dark:text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-stone-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded-md [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] dark:[&_code]:bg-muted/40 [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1.5 [&_ol]:my-3 [&_ol]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-stone-200 [&_pre]:bg-stone-100 [&_pre]:p-4 dark:[&_pre]:border-border dark:[&_pre]:bg-muted/40 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {parsedAssistant.response || message.content || "..."}
        </ReactMarkdown>
      </div>
      <EvidenceUsedBlock evidenceUsed={evidenceUsed} />
      {parsedAssistant.coverLetterDraft ? (
        <CoverLetterArtifactCard draft={parsedAssistant.coverLetterDraft} />
      ) : null}
    </div>
  );
};
