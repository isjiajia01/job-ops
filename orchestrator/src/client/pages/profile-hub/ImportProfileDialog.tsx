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

type Props = {
  pendingImportJson: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const ImportProfileDialog: React.FC<Props> = ({
  pendingImportJson,
  onOpenChange,
  onConfirm,
}) => {
  return (
    <AlertDialog open={Boolean(pendingImportJson)} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Import profile JSON?</AlertDialogTitle>
          <AlertDialogDescription>
            This will replace the current form values with the uploaded JSON. It
            will not overwrite saved data until you click `Save Profile`.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[50vh] overflow-auto rounded-md border border-border/60 bg-muted/20 p-3">
          <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground/90">
            {pendingImportJson}
          </pre>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm Import</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
