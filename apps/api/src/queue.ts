import { Queue } from "bullmq";
import * as IORedis from "ioredis";

export const DELETION_QUEUE_NAME = "deletions";

export type DeletionJobPayload = {
  deletionJobId: string;
};

let deletionQueue: Queue<DeletionJobPayload> | undefined;

function getRedisConnection(redisUrl: string) {
  const RedisCtor: any = (IORedis as any).default ?? (IORedis as any);
  return new RedisCtor(redisUrl, { maxRetriesPerRequest: null });
}

export function getDeletionQueue(redisUrl: string) {
  deletionQueue ??= new Queue<DeletionJobPayload>(DELETION_QUEUE_NAME, {
    connection: getRedisConnection(redisUrl),
  });
  return deletionQueue;
}

export async function enqueueDeletionJob(opts: {
  redisUrl: string;
  deletionJobId: string;
}) {
  const queue = getDeletionQueue(opts.redisUrl);
  await queue.add(
    "process-deletion-job",
    { deletionJobId: opts.deletionJobId },
    {
      jobId: opts.deletionJobId,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
}
