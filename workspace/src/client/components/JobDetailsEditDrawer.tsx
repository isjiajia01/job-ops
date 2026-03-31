import type { Application } from "@shared/types.js";
import type React from "react";
import { ApplicationDetailsEditDrawer } from "./ApplicationDetailsEditDrawer";

type JobDetailsEditDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Application | null;
  onJobUpdated: () => void | Promise<void>;
};

export const JobDetailsEditDrawer: React.FC<JobDetailsEditDrawerProps> = ({
  open,
  onOpenChange,
  job,
  onJobUpdated,
}) => (
  <ApplicationDetailsEditDrawer
    open={open}
    onOpenChange={onOpenChange}
    application={job}
    onApplicationUpdated={onJobUpdated}
  />
);
