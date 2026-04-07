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
          className={cn("h-9 gap-1.5 rounded-full border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50", triggerClassName)}
          disabled={!job}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Side panel
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-none lg:w-[50vw] xl:w-[40vw] 2xl:w-[30vw]"
      >
        <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,#f8fbfa_0%,#f3f7f6_100%)] p-5">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl text-slate-900">Ghostwriter studio</SheetTitle>
            <SheetDescription className="text-slate-500">
              {job && `${job.title} at ${job.employer}. Use this focused writing surface when you want the drafting system separate from the main workspace.`}
            </SheetDescription>
          </SheetHeader>
        </div>

        {job && (
          <div className="flex min-h-0 flex-1 bg-[linear-gradient(180deg,#eef4f2_0%,#f6f8f7_100%)] p-5 pt-4">
            <GhostwriterPanel job={job} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
