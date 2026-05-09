export const PostType = {
  NORMAL: "NORMAL",
  REPLY: "REPLY",
  QUOTE: "QUOTE",
  REPOST: "REPOST",
} as const;
export type PostType = (typeof PostType)[keyof typeof PostType];

export const PostSource = {
  API_SCAN: "API_SCAN",
  ARCHIVE_IMPORT: "ARCHIVE_IMPORT",
  MANUAL_IMPORT: "MANUAL_IMPORT",
} as const;
export type PostSource = (typeof PostSource)[keyof typeof PostSource];

export const PostDeletionStatus = {
  NOT_REQUESTED: "NOT_REQUESTED",
  PENDING: "PENDING",
  DELETED: "DELETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type PostDeletionStatus =
  (typeof PostDeletionStatus)[keyof typeof PostDeletionStatus];

export const DeletionJobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  PARTIALLY_FAILED: "PARTIALLY_FAILED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type DeletionJobStatus =
  (typeof DeletionJobStatus)[keyof typeof DeletionJobStatus];

export const DeletionItemStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  WAITING_RATE_LIMIT: "WAITING_RATE_LIMIT",
  DELETED: "DELETED",
  DELETED_ALREADY: "DELETED_ALREADY",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
} as const;
export type DeletionItemStatus =
  (typeof DeletionItemStatus)[keyof typeof DeletionItemStatus];

export type PostRecord = {
  id: string;
  userId: string;
  text: string;
  createdAt: string; // ISO
  type: PostType;
  source: PostSource;
  sourceTweetId?: string | null;
  deletionStatus: PostDeletionStatus;
  errorMessage?: string | null;
};

export type ScanResult = {
  scannedCount: number;
  upsertedCount: number;
  nextToken?: string | null;
};

export type CreateDeletionJobRequest = {
  dryRun?: boolean; // default true
  filters?: {
    types?: PostType[];
    beforeDate?: string; // ISO
    keyword?: string;
  };
};

