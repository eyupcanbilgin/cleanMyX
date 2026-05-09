import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma.js", () => ({ prisma: {} }));

function createFakePrisma() {
  const users = new Map<string, any>();
  const usersByXId = new Map<string, any>();
  const tokens = new Map<string, any>();
  const posts = new Map<string, any>();
  const deletionJobs = new Map<string, any>();
  const auditLogs: any[] = [];
  let userSeq = 0;
  let jobSeq = 0;
  let itemSeq = 0;

  const db = {
    users,
    tokens,
    posts,
    deletionJobs,
    auditLogs,
    user: {
      async findFirst({ where }: any) {
        const id = where?.OR?.find((clause: any) => clause.id)?.id;
        const xUserId = where?.OR?.find((clause: any) => clause.xUserId)?.xUserId;
        return (id ? users.get(id) : undefined) ?? (xUserId ? usersByXId.get(xUserId) : undefined) ?? null;
      },
      async upsert({ where, update, create }: any) {
        const existing = usersByXId.get(where.xUserId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const user = { id: `user-${++userSeq}`, xUserId: create.xUserId, createdAt: new Date() };
        users.set(user.id, user);
        usersByXId.set(user.xUserId, user);
        return user;
      },
    },
    xToken: {
      async findUnique({ where }: any) {
        return tokens.get(where.userId) ?? null;
      },
      async upsert({ where, update, create }: any) {
        const existing = tokens.get(where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const token = { id: `token-${where.userId}`, ...create };
        tokens.set(where.userId, token);
        return token;
      },
    },
    post: {
      async upsert({ where, update, create }: any) {
        const existing = posts.get(where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const post = {
          deletionStatus: "NOT_REQUESTED",
          errorMessage: null,
          lastSeenAt: new Date(),
          ...create,
        };
        posts.set(where.id, post);
        return post;
      },
      async findMany({ where, take }: any) {
        let rows = Array.from(posts.values()).filter((post) => post.userId === where.userId);
        if (where.type) rows = rows.filter((post) => post.type === where.type);
        if (where.source) rows = rows.filter((post) => post.source === where.source);
        if (where.createdAt?.lt) {
          rows = rows.filter((post) => post.createdAt < where.createdAt.lt);
        }
        if (where.text?.contains) {
          rows = rows.filter((post) =>
            post.text.toLowerCase().includes(where.text.contains.toLowerCase())
          );
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.slice(0, take ?? rows.length);
      },
      async updateMany({ where, data }: any) {
        const ids = new Set(where.id?.in ?? []);
        let count = 0;
        for (const post of posts.values()) {
          if (post.userId === where.userId && ids.has(post.id)) {
            Object.assign(post, data);
            count++;
          }
        }
        return { count };
      },
    },
    deletionJob: {
      async create({ data, include }: any) {
        const job = {
          id: `job-${++jobSeq}`,
          userId: data.userId,
          dryRun: data.dryRun,
          status: data.status,
          createdAt: new Date(),
          startedAt: null,
          finishedAt: null,
          items: data.items.create.map((item: any) => ({
            id: `item-${++itemSeq}`,
            jobId: `job-${jobSeq}`,
            postId: item.postId,
            status: "PENDING",
            attempts: 0,
            lastError: null,
            rateLimitResetAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        };
        deletionJobs.set(job.id, job);
        return include?.items ? job : { ...job, items: undefined };
      },
      async update({ where, data }: any) {
        const job = deletionJobs.get(where.id);
        Object.assign(job, data);
        return job;
      },
      async findFirst({ where }: any) {
        const job = deletionJobs.get(where.id);
        return job?.userId === where.userId ? job : null;
      },
    },
    auditLog: {
      async create({ data }: any) {
        auditLogs.push({ id: `audit-${auditLogs.length + 1}`, ...data });
        return auditLogs.at(-1);
      },
    },
    xAuthSession: {
      async create() {},
      async findUnique() {
        return null;
      },
      async delete() {},
    },
  };

  return db;
}

describe("api routes", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
  });

  it("health returns ok", async () => {
    const { buildServer } = await import("./server.js");
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    await app.close();
  });

  it("scan persists mock posts for the default mock user", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.from("s".repeat(32)).toString("base64"));
    vi.stubEnv("X_USE_REAL", "false");

    const { buildServer } = await import("./server.js");
    const db = createFakePrisma();
    const app = await buildServer({ prisma: db as any, enqueueDeletionJob: vi.fn() });

    const res = await app.inject({
      method: "POST",
      url: "/v1/scan",
      headers: { "x-user-id": "mock-user-1" },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ ok: true, scanned: 4, upserted: 4, xUserId: "mock-user-1" });
    expect(db.posts.size).toBe(4);
    expect(Array.from(db.posts.values()).map((post) => post.type).sort()).toEqual([
      "NORMAL",
      "QUOTE",
      "REPLY",
      "REPOST",
    ]);

    await app.close();
  });

  it("deletion job creation creates items and enqueues BullMQ work", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.from("j".repeat(32)).toString("base64"));
    vi.stubEnv("X_USE_REAL", "false");

    const { buildServer } = await import("./server.js");
    const db = createFakePrisma();
    const enqueueDeletionJob = vi.fn(async () => {});
    const app = await buildServer({ prisma: db as any, enqueueDeletionJob });

    await app.inject({
      method: "POST",
      url: "/v1/scan",
      headers: { "x-user-id": "mock-user-1" },
      payload: {},
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/deletions",
      headers: { "x-user-id": "mock-user-1", "content-type": "application/json" },
      payload: { dryRun: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ ok: true, jobId: "job-1", dryRun: true, items: 4 });
    expect(enqueueDeletionJob).toHaveBeenCalledWith("job-1");
    expect(db.deletionJobs.get("job-1").items).toHaveLength(4);
    expect(Array.from(db.posts.values()).every((post) => post.deletionStatus === "PENDING")).toBe(
      true
    );

    await app.close();
  });
});
