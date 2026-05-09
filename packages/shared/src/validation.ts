import { z } from "zod";
import { DeletionItemStatus, DeletionJobStatus, PostSource, PostType } from "./types.js";

export const PostTypeSchema = z.enum([
  PostType.NORMAL,
  PostType.REPLY,
  PostType.QUOTE,
  PostType.REPOST,
]);

export const PostSourceSchema = z.enum([
  PostSource.API_SCAN,
  PostSource.ARCHIVE_IMPORT,
  PostSource.MANUAL_IMPORT,
]);

export const DeletionJobStatusSchema = z.enum([
  DeletionJobStatus.PENDING,
  DeletionJobStatus.RUNNING,
  DeletionJobStatus.COMPLETED,
  DeletionJobStatus.PARTIALLY_FAILED,
  DeletionJobStatus.FAILED,
  DeletionJobStatus.CANCELLED,
]);

export const DeletionItemStatusSchema = z.enum([
  DeletionItemStatus.PENDING,
  DeletionItemStatus.RUNNING,
  DeletionItemStatus.WAITING_RATE_LIMIT,
  DeletionItemStatus.DELETED,
  DeletionItemStatus.DELETED_ALREADY,
  DeletionItemStatus.SKIPPED,
  DeletionItemStatus.FAILED,
]);

export const ListPostsQuerySchema = z.object({
  type: PostTypeSchema.optional(),
  source: PostSourceSchema.optional(),
  beforeDate: z.string().datetime().optional(),
  keyword: z.string().min(1).optional(),
}).strict();

export const CreateDeletionJobRequestSchema = z.object({
  dryRun: z.boolean().optional(),
  filters: z
    .object({
      types: z.array(PostTypeSchema).optional(),
      beforeDate: z.string().datetime().optional(),
      keyword: z.string().min(1).optional(),
    })
    .optional(),
}).strict();

