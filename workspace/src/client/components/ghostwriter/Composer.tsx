import { getMetaShortcutLabel, isMetaKeyPressed } from "@client/lib/meta-key";
import { Eraser, Send, Square } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ComposerProps = {
  disabled?: boolean;
  isStreaming: boolean;
  canReset: boolean;
  onStop: () => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onReset: () => void;
};

export const Composer: React.FC<ComposerProps> = ({
  disabled,
  isStreaming,
  canReset,
  onStop,
  onSend,
  onReset,
}) => {
  const [value, setValue] = useState("");

  const submit = async () => {
    const content = value.trim();
    if (!content || disabled) return;
    setValue("");
    await onSend(content);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <Textarea
          placeholder="Ask anything about this job, your fit, the CV angle, or the best next draft..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          onKeyDown={(event) => {
            if (isMetaKeyPressed(event) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-[108px] rounded-[24px] border-0 bg-transparent px-5 py-4 text-[15px] leading-7 text-slate-700 shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-400">
          {getMetaShortcutLabel("Enter")} to send · Shift+Enter for newline
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={onReset}
            disabled={disabled || !canReset}
            aria-label="Start over"
            title="Start over"
            className="rounded-full border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>

          {isStreaming && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => void onStop()}
              aria-label="Stop generating"
              title="Stop generating"
            className="rounded-full border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            size="icon"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            title="Send message"
            className="rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
