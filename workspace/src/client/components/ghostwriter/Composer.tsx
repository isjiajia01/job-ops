import { getMetaShortcutLabel, isMetaKeyPressed } from "@client/lib/meta-key";
import { Eraser, Send, Square } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ComposerProps = {
  disabled?: boolean;
  isStreaming: boolean;
  canReset: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onStop: () => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onReset: () => void;
};

export const Composer: React.FC<ComposerProps> = ({
  disabled,
  isStreaming,
  canReset,
  value,
  onValueChange,
  onStop,
  onSend,
  onReset,
}) => {
  const submit = async () => {
    const content = value.trim();
    if (!content || disabled) return;
    onValueChange("");
    await onSend(content);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/60 bg-background/80 shadow-sm">
        <Textarea
          placeholder="Ask anything about this job, your fit, the CV angle, or the best next draft..."
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={disabled}
          onKeyDown={(event) => {
            if (isMetaKeyPressed(event) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-[108px] rounded-2xl border-0 bg-transparent px-4 py-3 text-[15px] leading-7 text-foreground shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
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
            className="rounded-full border-border/60 text-muted-foreground hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
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
            className="rounded-full border-border/60 text-muted-foreground hover:bg-muted"
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
