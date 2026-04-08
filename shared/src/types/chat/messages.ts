export const JOB_CHAT_MESSAGE_ROLES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const;
export type JobChatMessageRole = (typeof JOB_CHAT_MESSAGE_ROLES)[number];

export const JOB_CHAT_MESSAGE_STATUSES = [
  "complete",
  "partial",
  "cancelled",
  "failed",
] as const;
export type JobChatMessageStatus = (typeof JOB_CHAT_MESSAGE_STATUSES)[number];

export interface JobChatThread {
  id: string;
  jobId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  activeRootMessageId: string | null;
}

export interface JobChatMessage {
  id: string;
  threadId: string;
  jobId: string;
  role: JobChatMessageRole;
  content: string;
  status: JobChatMessageStatus;
  tokensIn: number | null;
  tokensOut: number | null;
  version: number;
  replacesMessageId: string | null;
  parentMessageId: string | null;
  activeChildId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BranchInfo {
  messageId: string;
  siblingIds: string[];
  activeIndex: number;
}
