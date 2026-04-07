import { Check, Copy, FileText, RefreshCcw, Wand2 } from "lucide-react";
import type React from "react";

type Props = {
  canCopy: boolean;
  isCopied: boolean;
  hasCoverLetterDraft: boolean;
  hasResumePatch: boolean;
  onCopy: () => void;
  onTurnIntoCoverLetter: () => void;
  onApplyResumePatch: () => void;
  onRegenerate: () => void;
};

export const ResponseTools: React.FC<Props> = ({
  canCopy,
  isCopied,
  hasCoverLetterDraft,
  hasResumePatch,
  onCopy,
  onTurnIntoCoverLetter,
  onApplyResumePatch,
  onRegenerate,
}) => {
  return (
    <>
      {canCopy ? (
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Copy response"
          title="Copy response"
        >
          {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{isCopied ? "Copied" : "Copy"}</span>
        </button>
      ) : null}
      {hasCoverLetterDraft ? (
        <button
          type="button"
          onClick={onTurnIntoCoverLetter}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Turn into cover letter"
          title="Turn into cover letter"
        >
          <FileText className="h-3 w-3" />
          <span>Cover letter</span>
        </button>
      ) : null}
      {hasResumePatch ? (
        <button
          type="button"
          onClick={onApplyResumePatch}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Apply to CV patch"
          title="Apply to CV patch"
        >
          <Wand2 className="h-3 w-3" />
          <span>Apply to CV</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRegenerate}
        className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        aria-label="Regenerate response"
        title="Regenerate response"
      >
        <RefreshCcw className="h-3 w-3" />
      </button>
    </>
  );
};
