import { describe, expect, it, vi } from "vitest";
import { encryptString } from "@xcleaner/crypto";
import { XApiError, type XApiClient } from "@xcleaner/x-client";
import { processDeletionJob } from "./worker.js";

vi.mock("./prisma.js", () => ({ prisma: {} }));

function createWorkerDb(opts: { dryRun: boolean; key: string }) {
  const userId = "user-1";
  const postRecord = {
    id: "tweet-1",
    userId,
    text: "hello",
    createdAt: new Date(),
    type: "NORMAL",
    source: "API_SCAN",
    sourceTweetId: null,
    deletionStatus: "PENDING",
    errorMessage: null,
  };
  const item = {
    id: "item-1",
    jobId: "job-1",
    postId: postRecord.id,
    post: postRecord,
    status: "PENDING",
    attempts: 0,
    lastError: null,
    rateLimitResetAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const job = {
    id: "job-1",
    userId,
    user: { id: userId, xUserId: "mock-user-1" },
    dryRun: opts.dryRun,
    status: "PENDING",
    startedAt: null,
    finishedAt: null,
    items: [item],
  };
  const token = {
    userId,
    encAccessToken: encryptString({
      plaintext: "mock-access-token",
      keyBase64: opts.key,
      aad: userId,
    }),
  };
  const auditLogs: any[] = [];

  const db = {
    job,
    item,
    postRecord,
    auditLogs,
    deletionJob: {
      async findUnique({ where }: any) {
        return where.id === job.id ? job : null;
      },
      async update({ where, data }: any) {
        if (where.id !== job.id) return null;
        Object.assign(job, data);
        return job;
      },
    },
    xToken: {
      async findUnique({ where }: any) {
        return where.userId === userId ? token : null;
      },
    },
    deletionJobItem: {
      async update({ where, data }: any) {
        if (where.id !== item.id) return null;
        if (data.attempts?.increment) item.attempts += data.attempts.increment;
        if (data.status) item.status = data.status;
        if ("lastError" in data) item.lastError = data.lastError;
        if ("rateLimitResetAt" in data) item.rateLimitResetAt = data.rateLimitResetAt;
        item.updatedAt = new Date();
        return item;
      },
    },
    post: {
      async update({ where, data }: any) {
        if (where.id !== postRecord.id) return null;
        Object.assign(postRecord, data);
        return postRecord;
      },
    },
    auditLog: {
      async create({ data }: any) {
        auditLogs.push({ id: `audit-${auditLogs.length + 1}`, ...data });
        return auditLogs.at(-1);
      },
    },
  };

  return db;
}

function createXClient(overrides: Partial<XApiClient> = {}): XApiClient {
  return {
    getMe: vi.fn(),
    listUserTweets: vi.fn(),
    deleteTweet: vi.fn(async () => ({ data: { deleted: true }, meta: {} })),
    deleteRetweet: vi.fn(async () => ({ data: { deleted: true }, meta: {} })),
    ...overrides,
  } as XApiClient;
}

describe("worker deletion processor", () => {
  it("dry-run skips items without calling delete methods", async () => {
    const key = Buffer.from("d".repeat(32)).toString("base64");
    const db = createWorkerDb({ dryRun: true, key });
    const xClient = createXClient();

    await processDeletionJob(
      { data: { deletionJobId: "job-1" }, moveToDelayed: vi.fn() } as any,
      { prisma: db as any, xClient, tokenEncKeyBase64: key }
    );

    expect(xClient.deleteTweet).not.toHaveBeenCalled();
    expect(xClient.deleteRetweet).not.toHaveBeenCalled();
    expect(db.item.status).toBe("SKIPPED");
    expect(db.postRecord.deletionStatus).toBe("SKIPPED");
    expect(db.job.status).toBe("COMPLETED");
  });

  it("handles 404 deletes as already deleted", async () => {
    const key = Buffer.from("n".repeat(32)).toString("base64");
    const db = createWorkerDb({ dryRun: false, key });
    const xClient = createXClient({
      deleteTweet: vi.fn(async () => {
        throw new XApiError({ message: "not found", kind: "NOT_FOUND", status: 404 });
      }),
    });

    await processDeletionJob(
      { data: { deletionJobId: "job-1" }, moveToDelayed: vi.fn() } as any,
      { prisma: db as any, xClient, tokenEncKeyBase64: key }
    );

    expect(xClient.deleteTweet).toHaveBeenCalledWith("mock-access-token", { tweetId: "tweet-1" });
    expect(db.item.status).toBe("DELETED_ALREADY");
    expect(db.postRecord.deletionStatus).toBe("DELETED");
    expect(db.job.status).toBe("COMPLETED");
  });

  it("handles 429 as waiting rate limit and delays the queue job", async () => {
    const key = Buffer.from("r".repeat(32)).toString("base64");
    const db = createWorkerDb({ dryRun: false, key });
    const moveToDelayed = vi.fn(async () => {});
    const resetEpochSeconds = Math.floor(Date.now() / 1000) + 60;
    const xClient = createXClient({
      deleteTweet: vi.fn(async () => {
        throw new XApiError({
          message: "rate limited",
          kind: "RATE_LIMITED",
          status: 429,
          rateLimit: { resetEpochSeconds },
        });
      }),
    });

    await expect(
      processDeletionJob(
        { data: { deletionJobId: "job-1" }, moveToDelayed, token: "lock-token" } as any,
        {
          prisma: db as any,
          xClient,
          tokenEncKeyBase64: key,
          log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
        }
      )
    ).rejects.toMatchObject({ name: "DelayedError" });

    expect(db.item.status).toBe("WAITING_RATE_LIMIT");
    expect(db.item.lastError).toBe("rate_limited");
    expect(db.postRecord.deletionStatus).toBe("PENDING");
    expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), "lock-token");
    expect(db.job.status).toBe("RUNNING");
  });
});
