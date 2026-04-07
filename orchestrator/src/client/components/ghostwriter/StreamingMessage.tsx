import type React from "react";

type StreamingMessageProps = {
  content: string;
};

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  content,
}) => {
  return (
    <div className="rounded-[26px] border border-stone-200/80 bg-white px-5 py-4 text-sm leading-7 text-stone-800 shadow-[0_10px_30px_rgba(120,98,68,0.06)] dark:border-border/60 dark:bg-background dark:text-foreground">
      <div className="whitespace-pre-wrap">
        {content}
        <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded bg-[#df6f3c]/70 align-middle dark:bg-primary/60" />
      </div>
    </div>
  );
};
