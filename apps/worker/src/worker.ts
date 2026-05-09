import { DelayedError, Worker, type Job } from "bullmq";
import * as IORedis from "ioredis";
import type { PrismaClient } from "@prisma/client";
import {
  createXApiClient,
  XApiError,
  type XApiClient,
} from "@xcleaner/x-client";
import { decryptString } from "@xcleaner/crypto";
import { prisma as defaultPrisma } from "./prisma.js";
import { createLogger } from "./logger.js";
import { getWorkerConfig } from "./config.js";
import { DELETION_QUEUE_NAME, type DeletionJobPayload } from "./queue.js";

const defaultLog = createLogger();

type DeletionQueueJob = Pick<Job<DeletionJobPayload>, "data" | "moveToDelayed"> & {
  token?: string;
};

export type ProcessDeletionJobDeps = {
  prisma?: PrismaClient;
  xClient?: XApiClient;
  tokenEncKeyBase64?: string;
  env?: NodeJS.ProcessEnv;
  log?: Pick<typeof defaultLog, "warn" | "error" | "info">;
};

function requireEncKey(key: string) {
  if (!key) throw new Error("TOKEN_ENC_KEY is required");
}

function toResetDate(resetEpochSeconds?: number): Date | undefined {
  if (!resetEpochSeconds || !Number.isFinite(resetEpochSeconds)) return undefined;
  return new Date(resetEpochSeconds * 1000);
}

function isFinalItemStatus(status: string) {
  return status === "DELETED" || status === "SKIPPED" || status === "DELETED_ALREADY";
}

function getFinalJobStatus(items: Array<{ status: string }>) {
  const failed = items.filter((item) => item.status === "FAILED").length;
  if (failed === 0) return "COMPLETED";
  return failed === items.length ? "FAILED" : "PARTIALLY_FAILED";
}

async function writeAudit(opts: {
  db: PrismaClient;
  userId: string;
  action: string;
  metadataJson: Record<string, unknown>;
}) {
  await opts.db.auditLog.create({
    data: {
      userId: opts.userId,
      action: opts.action,
      metadataJson: opts.metadataJson as any,
    },
  });
}

async function updateItemAndPost(opts: {
  db: PrismaClient;
  item: any;
  itemStatus: string;
  postStatus?: string;
  lastError?: string | null;
  rateLimitResetAt?: Date | null;
}) {
  await opts.db.deletionJobItem.update({
    where: { id: opts.item.id },
    data: {
      status: opts.itemStatus as any,
      lastError: opts.lastError,
      rateLimitResetAt: opts.rateLimitResetAt,
    },
  });
  opts.item.status = opts.itemStatus;
  opts.item.lastError = opts.lastError;
  opts.item.rateLimitResetAt = opts.rateLimitResetAt;

  if (opts.postStatus) {
    await opts.db.post.update({
      where: { id: opts.item.postId },
      data: {
        deletionStatus: opts.postStatus as any,
        errorMessage: opts.lastError,
      },
    });
  }
}

export async function processDeletionJob(
  job: DeletionQueueJob,
  deps: ProcessDeletionJobDeps = {}
) {
  const cfg = getWorkerConfig();
  const db = deps.prisma ?? defaultPrisma;
  const log = deps.log ?? defaultLog;
  const tokenEncKeyBase64 = deps.tokenEncKeyBase64 ?? cfg.tokenEncKeyBase64;
  const env = deps.env ?? process.env;
  requireEncKey(tokenEncKeyBase64);

  const deletionJob = await db.deletionJob.findUnique({
    where: { id: job.data.deletionJobId },
    include: {
      user: true,
      items: { include: { post: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!deletionJob) return;
  if (deletionJob.status === "CANCELLED" || deletionJob.status === "COMPLETED") {
    return;
  }

  await db.deletionJob.update({
    where: { id: deletionJob.id },
    data: { status: "RUNNING", startedAt: deletionJob.startedAt ?? new Date() },
  });
  deletionJob.status = "RUNNING";

  const tokenRow = await db.xToken.findUnique({
    where: { userId: deletionJob.userId },
  });
  if (!tokenRow) {
    await db.deletionJob.update({
      where: { id: deletionJob.id },
      data: { status: "FAILED", finishedAt: new Date() },
    });
    await writeAudit({
      db,
      userId: deletionJob.userId,
      action: "deletion_job_failed",
      metadataJson: { jobId: deletionJob.id, reason: "missing_token" },
    });
    return;
  }

  const accessToken = decryptString({
    payload: tokenRow.encAccessToken as any,
    keyBase64: tokenEncKeyBase64,
    aad: deletionJob.userId,
  });

  const x = deps.xClient ?? createXApiClient(env);
  const items = deletionJob.items as Array<any>;

  for (const item of items) {
    if (isFinalItemStatus(item.status)) {
      continue;
    }

    if (deletionJob.dryRun) {
      await updateItemAndPost({
        db,
        item,
        itemStatus: "SKIPPED",
        postStatus: "SKIPPED",
        lastError: null,
        rateLimitResetAt: null,
      });
      await writeAudit({
        db,
        userId: deletionJob.userId,
        action: "deletion_item_skipped_dry_run",
        metadataJson: { jobId: deletionJob.id, postId: item.postId },
      });
      continue;
    }

    await db.deletionJobItem.update({
      where: { id: item.id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        lastError: null,
        rateLimitResetAt: null,
      },
    });
    item.status = "RUNNING";
    item.attempts += 1;

    try {
      if (item.post.type === "REPOST") {
        const sourceTweetId = item.post.sourceTweetId;
        if (!sourceTweetId) {
          throw new Error("Missing sourceTweetId for REPOST");
        }
        await x.deleteRetweet(accessToken, {
          userId: deletionJob.user.xUserId,
          sourceTweetId,
        });
      } else {
        await x.deleteTweet(accessToken, { tweetId: item.postId });
      }

      await updateItemAndPost({
        db,
        item,
        itemStatus: "DELETED",
        postStatus: "DELETED",
        lastError: null,
        rateLimitResetAt: null,
      });
      await writeAudit({
        db,
        userId: deletionJob.userId,
        action: "deletion_item_deleted",
        metadataJson: { jobId: deletionJob.id, postId: item.postId },
      });
    } catch (err) {
      if (err instanceof XApiError) {
        if (err.kind === "RATE_LIMITED") {
          const resetAt = toResetDate(err.rateLimit?.resetEpochSeconds);
          await updateItemAndPost({
            db,
            item,
            itemStatus: "WAITING_RATE_LIMIT",
            postStatus: "PENDING",
            lastError: "rate_limited",
            rateLimitResetAt: resetAt ?? null,
          });
          await writeAudit({
            db,
            userId: deletionJob.userId,
            action: "deletion_item_waiting_rate_limit",
            metadataJson: {
              jobId: deletionJob.id,
              postId: item.postId,
              rateLimitResetAt: resetAt?.toISOString() ?? null,
            },
          });

          const delayUntil = resetAt?.getTime() ?? Date.now() + 60_000;
          const delayMs = Math.max(5_000, delayUntil - Date.now());
          log.warn({ jobId: deletionJob.id, delayMs }, "Rate limited, delaying job");
          await job.moveToDelayed(Date.now() + delayMs, job.token);
          throw new DelayedError();
        }

        if (err.kind === "NOT_FOUND") {
          await updateItemAndPost({
            db,
            item,
            itemStatus: "DELETED_ALREADY",
            postStatus: "DELETED",
            lastError: null,
            rateLimitResetAt: null,
          });
          await writeAudit({
            db,
            userId: deletionJob.userId,
            action: "deletion_item_deleted_already",
            metadataJson: { jobId: deletionJob.id, postId: item.postId },
          });
          continue;
        }
      }

      const message = String((err as any)?.message ?? err);
      await updateItemAndPost({
        db,
        item,
        itemStatus: "FAILED",
        postStatus: "FAILED",
        lastError: message,
        rateLimitResetAt: null,
      });
      await writeAudit({
        db,
        userId: deletionJob.userId,
        action: "deletion_item_failed",
        metadataJson: { jobId: deletionJob.id, postId: item.postId, error: message },
      });
    }
  }

  const finalStatus = getFinalJobStatus(items);
  await db.deletionJob.update({
    where: { id: deletionJob.id },
    data: { status: finalStatus as any, finishedAt: new Date() },
  });
  await writeAudit({
    db,
    userId: deletionJob.userId,
    action: "deletion_job_finished",
    metadataJson: { jobId: deletionJob.id, status: finalStatus },
  });
}

export function startWorker() {
  const cfg = getWorkerConfig();
  const RedisCtor: any = (IORedis as any).default ?? (IORedis as any);
  const connection = new RedisCtor(cfg.redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<DeletionJobPayload>(
    DELETION_QUEUE_NAME,
    async (job) => {
      await processDeletionJob(job);
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    defaultLog.error({ jobId: job?.id, err }, "Worker job failed");
  });
  worker.on("completed", (job) => {
    defaultLog.info({ jobId: job.id }, "Worker job completed");
  });

  return worker;
}
