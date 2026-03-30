import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useRescoreApplicationMutation } from "@/client/hooks/queries/useApplicationMutations";
import { trackProductEvent } from "@/lib/analytics";

export function useRescoreApplication(
  onApplicationUpdated: () => void | Promise<void>,
) {
  const [isRescoring, setIsRescoring] = useState(false);
  const rescoreMutation = useRescoreApplicationMutation();

  const rescoreApplication = useCallback(
    async (applicationId?: string | null) => {
      if (!applicationId) return;

      try {
        setIsRescoring(true);
        await rescoreMutation.mutateAsync(applicationId);
        trackProductEvent("jobs_job_action_completed", {
          action: "rescore",
          result: "success",
        });
        toast.success("Match recalculated");
        await onApplicationUpdated();
      } catch (error) {
        trackProductEvent("jobs_job_action_completed", {
          action: "rescore",
          result: "error",
        });
        const message =
          error instanceof Error
            ? error.message
            : "Failed to recalculate match";
        toast.error(message);
      } finally {
        setIsRescoring(false);
      }
    },
    [onApplicationUpdated, rescoreMutation],
  );

  return { isRescoring, rescoreApplication };
}
