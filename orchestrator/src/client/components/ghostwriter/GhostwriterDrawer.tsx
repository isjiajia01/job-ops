import type { Job } from "@shared/types";
import { PanelRightOpen } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { GhostwriterPanel } from "./GhostwriterPanel";

type GhostwriterDrawerProps = {
  job: Job | null;
  triggerClassName?: string;
};

export const GhostwriterDrawer: React.FC<GhostwriterDrawerProps> = ({
  job,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-8 gap-1.5 text-xs", triggerClassName)}
          disabled={!job}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          AI Copilot
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-stone-200/80 bg-[#f7f3eb] p-0 text-stone-900 sm:max-w-none dark:border-border dark:bg-background dark:text-foreground lg:w-[50vw] xl:w-[40vw] 2xl:w-[30vw]"
      >
        <div className="border-b border-stone-200/80 bg-[#fbf8f2] p-4 dark:border-border/50 dark:bg-background">
          <SheetHeader>
            <SheetTitle>AI Copilot</SheetTitle>
            <SheetDescription>
              {job && `${job.title} at ${job.employer}.`}
            </SheetDescription>
          </SheetHeader>
        </div>

        {job && (
          <div className="flex min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_rgba(247,243,235,0.96)_44%,_rgba(243,237,227,1)_100%)] p-4 pt-0 dark:bg-none">
            <GhostwriterPanel job={job} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
