export const JOB_CHAT_RUN_STATUSES = [
  "running",
  "completed",
  "cancelled",
  "failed",
] as const;
export type JobChatRunStatus = (typeof JOB_CHAT_RUN_STATUSES)[number];

export interface JobChatRun {
  id: string;
  threadId: string;
  jobId: string;
  status: JobChatRunStatus;
  model: string | null;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
}
