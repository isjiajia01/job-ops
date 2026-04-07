import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ImportProfileDialogProps = {
  factsCount: number;
  inboxCount: number;
  isOpen: boolean;
  preferencesCount: number;
  projectsCount: number;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export const ImportProfileDialog: React.FC<ImportProfileDialogProps> = ({
  factsCount,
  inboxCount,
  isOpen,
  preferencesCount,
  projectsCount,
  onConfirm,
  onOpenChange,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Import Profile Hub bundle?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces the current draft in the editor with the imported
            profile bundle.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground sm:grid-cols-2">
          <div>Projects: {projectsCount}</div>
          <div>Facts: {factsCount}</div>
          <div>Rules: {preferencesCount}</div>
          <div>Inbox items: {inboxCount}</div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Import bundle</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
