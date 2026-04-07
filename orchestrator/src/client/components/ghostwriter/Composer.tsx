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
  strategyPrompt?: string | null;
  quickActions?: Array<{ label: string; prompt: string }>;
  onStop: () => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onReset: () => void;
};

export const Composer: React.FC<ComposerProps> = ({
  disabled,
  isStreaming,
  canReset,
  strategyPrompt,
  quickActions = [],
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
      {strategyPrompt && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Current job strategy
            </div>
            <div className="text-xs text-muted-foreground">
              Reuse the saved role angle for a more aligned CV or cover letter.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setValue(strategyPrompt)}
            className="h-8 text-xs"
          >
            Use current job strategy
          </Button>
        </div>
      )}

      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setValue(action.prompt)}
              className="h-8 rounded-full border-stone-200 bg-white px-3 text-xs text-stone-700 hover:bg-stone-50 dark:border-border dark:bg-background dark:text-foreground"
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      <div className="rounded-[24px] border border-stone-200/80 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(120,98,68,0.06)] dark:border-border/60 dark:bg-background">
        <Textarea
          placeholder="Ask Ghostwriter to draft, rewrite, or sharpen this application..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
              return;
            }
            if (isMetaKeyPressed(event) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-[104px] resize-none border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-muted-foreground">
          Enter to send · Shift+Enter for newline
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={onReset}
            disabled={disabled || !canReset}
            aria-label="Start over"
            title="Start over"
            className="border-stone-200 bg-white text-destructive hover:text-destructive dark:border-border dark:bg-background"
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
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
