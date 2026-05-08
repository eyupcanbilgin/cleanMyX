import { Worker, type Job } from "bullmq";
import * as IORedis from "ioredis";
import { createXApiClient, XApiError } from "@xcleaner/x-client";
import { decryptString } from "@xcleaner/crypto";
import { prisma } from "./prisma.js";
import { createLogger } from "./logger.js";
import { getWorkerConfig } from "./config.js";
import { DELETION_QUEUE_NAME, type DeletionJobPayload } from "./queue.js";

const log = createLogger();

function requireEncKey(key: string) {
  if (!key) throw new Error("TOKEN_ENC_KEY is required");
}

function toResetDate(resetEpochSeconds?: number): Date | undefined {
  if (!resetEpochSeconds || !Number.isFinite(resetEpochSeconds)) return undefined;
  return new Date(resetEpochSeconds * 1000);
}

async function processDeletionJob(job: Job<DeletionJobPayload>) {
  const cfg = getWorkerConfig();
  requireEncKey(cfg.tokenEncKeyBase64);

  const deletionJob = await prisma.deletionJob.findUnique({
    where: { id: job.data.deletionJobId },
    include: {
      items: { include: { post: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!deletionJob) return;

  await prisma.deletionJob.update({
    where: { id: deletionJob.id },
    data: { status: "RUNNING", startedAt: deletionJob.startedAt ?? new Date() },
  });

  const tokenRow = await prisma.xToken.findUnique({
    where: { userId: deletionJob.userId },
  });
  if (!tokenRow) {
    await prisma.deletionJob.update({
      where: { id: deletionJob.id },
      data: { status: "FAILED", finishedAt: new Date() },
    });
    return;
  }

  const accessToken = decryptString({
    payload: tokenRow.encAccessToken as any,
    keyBase64: cfg.tokenEncKeyBase64,
    aad: deletionJob.userId,
  });

  const x = createXApiClient(process.env);

  for (const item of deletionJob.items as Array<any>) {
    if (item.status === "DELETED" || item.status === "SKIPPED" || item.status === "DELETED_ALREADY") {
      continue; // idempotent
    }

    if (deletionJob.dryRun) {
      await prisma.deletionJobItem.update({
        where: { id: item.id },
        data: { status: "SKIPPED", updatedAt: new Date() },
      });
      continue;
    }

    await prisma.deletionJobItem.update({
      where: { id: item.id },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });

    try {
      if (item.post.type === "REPOST") {
        const sourceTweetId = item.post.sourceTweetId;
        if (!sourceTweetId) {
          throw new Error("Missing sourceTweetId for REPOST");
        }
        await x.deleteRetweet(accessToken, {
          userId: deletionJob.userId,
          sourceTweetId,
        });
      } else {
        await x.deleteTweet(accessToken, { tweetId: item.postId });
      }

      await prisma.deletionJobItem.update({
        where: { id: item.id },
        data: { status: "DELETED", lastError: null },
      });
      await prisma.auditLog.create({
        data: {
          userId: deletionJob.userId,
          action: "deletion_item_deleted",
          metadataJson: { jobId: deletionJob.id, postId: item.postId },
        },
      });
    } catch (err) {
      if (err instanceof XApiError) {
        if (err.kind === "RATE_LIMITED") {
          const resetAt = toResetDate(err.rateLimit?.resetEpochSeconds);
          await prisma.deletionJobItem.update({
            where: { id: item.id },
            data: {
              status: "WAITING_RATE_LIMIT",
              rateLimitResetAt: resetAt,
              lastError: "rate_limited",
            },
          });

          const delayUntil = resetAt?.getTime() ?? Date.now() + 60_000;
          const delayMs = Math.max(5_000, delayUntil - Date.now());
          log.warn({ jobId: deletionJob.id, delayMs }, "Rate limited, delaying job");
          await job.moveToDelayed(Date.now() + delayMs);
          return;
        }

        if (err.kind === "NOT_FOUND") {
          await prisma.deletionJobItem.update({
            where: { id: item.id },
            data: { status: "DELETED_ALREADY", lastError: null },
          });
          continue;
        }
      }

      await prisma.deletionJobItem.update({
        where: { id: item.id },
        data: { status: "FAILED", lastError: String((err as any)?.message ?? err) },
      });
      await prisma.auditLog.create({
        data: {
          userId: deletionJob.userId,
          action: "deletion_item_failed",
          metadataJson: { jobId: deletionJob.id, postId: item.postId },
        },
      });
    }
  }

  await prisma.deletionJob.update({
    where: { id: deletionJob.id },
    data: { status: "COMPLETED", finishedAt: new Date() },
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
    log.error({ jobId: job?.id, err }, "Worker job failed");
  });
  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "Worker job completed");
  });

  return worker;
}

