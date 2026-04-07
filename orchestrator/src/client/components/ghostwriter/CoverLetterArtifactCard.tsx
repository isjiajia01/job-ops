import { FileText } from "lucide-react";
import type React from "react";

type Props = {
  draft: string;
};

export const CoverLetterArtifactCard: React.FC<Props> = ({ draft }) => {
  return (
    <div className="rounded-[24px] border border-orange-200/80 bg-[#fff9f2] px-5 py-4 shadow-[0_10px_25px_rgba(214,145,80,0.08)] dark:border-orange-500/20 dark:bg-orange-500/5">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-orange-700 dark:text-orange-300">
        <FileText className="h-3.5 w-3.5" />
        Cover letter artifact
      </div>
      <div className="whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-foreground">
        {draft}
      </div>
    </div>
  );
};
