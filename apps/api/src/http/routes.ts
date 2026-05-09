import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getConfig } from "../config.js";
import type { AppConfig } from "../config.js";
import { prisma as defaultPrisma } from "../prisma.js";
import { enqueueDeletionJob as enqueueDeletionJobDefault } from "../queue.js";
import { encryptString, decryptString } from "@xcleaner/crypto";
import { createXApiClient, type XApiClient } from "@xcleaner/x-client";
import {
  CreateDeletionJobRequestSchema,
  ListPostsQuerySchema,
  PostType,
  type CreateDeletionJobRequest,
  type PostType as PostTypeValue,
} from "@xcleaner/shared";

import crypto from "node:crypto";

const DEFAULT_MOCK_X_USER_ID = "mock-user-1";
const MOCK_ACCESS_TOKEN = "mock-access-token";
const MOCK_REFRESH_TOKEN = "mock-refresh-token";

export type RouteDeps = {
  prisma?: PrismaClient;
  createXApiClient?: (env?: NodeJS.ProcessEnv) => XApiClient;
  enqueueDeletionJob?: (deletionJobId: string) => Promise<void>;
};

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function sha256Base64Url(input: string) {
  const digest = crypto.createHash("sha256").update(input).digest();
  return base64UrlEncode(digest);
}

function randomVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

function requireEncKey(encKey: string) {
  if (!encKey) throw new Error("TOKEN_ENC_KEY is required");
}

function getRequestUserIdentifier(req: FastifyRequest): string | undefined {
  const headerValue = req.headers["x-user-id"];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }

  const query = req.query as { userId?: unknown };
  if (typeof query?.userId === "string" && query.userId.trim()) {
    return query.userId.trim();
  }

  return undefined;
}

async function ensureMockToken(opts: {
  db: PrismaClient;
  userId: string;
  tokenEncKeyBase64: string;
}) {
  requireEncKey(opts.tokenEncKeyBase64);
  const encAccessToken = encryptString({
    plaintext: MOCK_ACCESS_TOKEN,
    keyBase64: opts.tokenEncKeyBase64,
    aad: opts.userId,
  });
  const encRefreshToken = encryptString({
    plaintext: MOCK_REFRESH_TOKEN,
    keyBase64: opts.tokenEncKeyBase64,
    aad: opts.userId,
  });

  await opts.db.xToken.upsert({
    where: { userId: opts.userId },
    update: {},
    create: {
      userId: opts.userId,
      encAccessToken,
      encRefreshToken,
      tokenType: "bearer",
      scopes: ["tweet.read", "users.read", "tweet.write"],
    },
  });
}

async function resolveRequestUser(opts: {
  req: FastifyRequest;
  db: PrismaClient;
  cfg: AppConfig;
}): Promise<{ id: string; xUserId: string } | undefined> {
  const identifier =
    getRequestUserIdentifier(opts.req) ??
    (!opts.cfg.xUseReal ? DEFAULT_MOCK_X_USER_ID : undefined);

  if (!identifier) return undefined;

  const found = await opts.db.user.findFirst({
    where: {
      OR: [{ id: identifier }, { xUserId: identifier }],
    },
  });

  if (found) {
    if (!opts.cfg.xUseReal) {
      await ensureMockToken({
        db: opts.db,
        userId: found.id,
        tokenEncKeyBase64: opts.cfg.tokenEncKeyBase64,
      });
    }
    return found;
  }

  if (opts.cfg.xUseReal) return undefined;

  const user = await opts.db.user.upsert({
    where: { xUserId: identifier },
    update: {},
    create: { xUserId: identifier },
  });

  await ensureMockToken({
    db: opts.db,
    userId: user.id,
    tokenEncKeyBase64: opts.cfg.tokenEncKeyBase64,
  });

  return user;
}

function countItemStatuses(items: Array<{ status: string }>) {
  const counts: Record<string, number> = {
    PENDING: 0,
    RUNNING: 0,
    WAITING_RATE_LIMIT: 0,
    DELETED: 0,
    DELETED_ALREADY: 0,
    SKIPPED: 0,
    FAILED: 0,
  };

  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }

  return counts;
}

function csvCell(value: unknown) {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${raw.replaceAll('"', '""')}"`;
}

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps = {}) {
  const cfg = getConfig();
  const db = deps.prisma ?? defaultPrisma;
  const xClientFactory = deps.createXApiClient ?? createXApiClient;
  const enqueueDeletionJob =
    deps.enqueueDeletionJob ??
    ((deletionJobId: string) =>
      enqueueDeletionJobDefault({
        redisUrl: cfg.redisUrl,
        deletionJobId,
      }));

  app.get("/health", async () => ({ ok: true }));

  app.get("/auth/x/start", async (req, reply) => {
    // PKCE: store encrypted code_verifier short-lived.
    requireEncKey(cfg.tokenEncKeyBase64);
    const state = crypto.randomUUID();
    const codeVerifier = randomVerifier();
    const codeChallenge = sha256Base64Url(codeVerifier);

    const encCodeVerifier = encryptString({
      plaintext: codeVerifier,
      keyBase64: cfg.tokenEncKeyBase64,
      aad: state,
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const redirectUrl = `${cfg.webBaseUrl}/dashboard`;

    await db.xAuthSession.create({
      data: {
        state,
        encCodeVerifier,
        expiresAt,
        postAuthRedirectUrl: redirectUrl,
      },
    });

    await db.auditLog.create({
      data: {
        action: "oauth_start",
        actorIp: req.ip,
        metadataJson: { state },
      },
    });

    if (!cfg.xClientId) {
      // Mock-first: if not configured, skip real X authorize and jump to callback simulation.
      return reply.redirect(
        `${cfg.apiBaseUrl}/auth/x/callback?state=${encodeURIComponent(
          state
        )}&code=mock-code`
      );
    }

    const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", cfg.xClientId);
    authUrl.searchParams.set("redirect_uri", cfg.xRedirectUri);
    authUrl.searchParams.set("scope", "tweet.read users.read tweet.write offline.access");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return reply.redirect(authUrl.toString());
  });

  app.get("/auth/x/callback", async (req, reply) => {
    const q = req.query as { state?: string; code?: string; error?: string };
    if (q.error) {
      await db.auditLog.create({
        data: {
          action: "oauth_callback_error",
          actorIp: req.ip,
          metadataJson: { error: q.error },
        },
      });
      return reply.code(400).send({ ok: false });
    }

    const state = q.state;
    const code = q.code;
    if (!state || !code) return reply.code(400).send({ ok: false });

    requireEncKey(cfg.tokenEncKeyBase64);
    const session = await db.xAuthSession.findUnique({ where: { state } });
    if (!session) return reply.code(400).send({ ok: false });
    if (session.expiresAt.getTime() < Date.now()) {
      await db.xAuthSession.delete({ where: { id: session.id } });
      return reply.code(400).send({ ok: false });
    }

    const codeVerifier = decryptString({
      payload: session.encCodeVerifier as any,
      keyBase64: cfg.tokenEncKeyBase64,
      aad: state,
    });

    // Token exchange (real vs mock-first)
    let accessToken = "mock-access-token";
    let refreshToken: string | undefined = "mock-refresh-token";
    let scopes: string[] = ["tweet.read", "users.read", "tweet.write"];
    let tokenType = "bearer";
    let expiresAt: Date | undefined;

    if (cfg.xUseReal && cfg.xClientId && cfg.xClientSecret) {
      const tokenUrl = "https://api.x.com/2/oauth2/token";
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cfg.xClientId,
        redirect_uri: cfg.xRedirectUri,
        code,
        code_verifier: codeVerifier,
      });

      const basic = Buffer.from(`${cfg.xClientId}:${cfg.xClientSecret}`).toString(
        "base64"
      );

      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) {
        await db.auditLog.create({
          data: {
            action: "oauth_callback_token_exchange_failed",
            actorIp: req.ip,
            metadataJson: { status: res.status },
          },
        });
        return reply.code(502).send({ ok: false });
      }
      const json = (await res.json()) as any;
      accessToken = json.access_token;
      refreshToken = json.refresh_token;
      tokenType = json.token_type;
      scopes = typeof json.scope === "string" ? json.scope.split(" ") : scopes;
      if (json.expires_in) {
        expiresAt = new Date(Date.now() + Number(json.expires_in) * 1000);
      }
    }

    // Fetch user id
    const xClient = xClientFactory(process.env);
    const me = await xClient.getMe(accessToken);

    const user = await db.user.upsert({
      where: { xUserId: me.data.id },
      update: {},
      create: { xUserId: me.data.id },
    });

    const encAccessToken = encryptString({
      plaintext: accessToken,
      keyBase64: cfg.tokenEncKeyBase64,
      aad: user.id,
    });
    const encRefreshToken = refreshToken
      ? encryptString({
          plaintext: refreshToken,
          keyBase64: cfg.tokenEncKeyBase64,
          aad: user.id,
        })
      : undefined;

    await db.xToken.upsert({
      where: { userId: user.id },
      update: {
        encAccessToken,
        encRefreshToken,
        tokenType,
        scopes,
        expiresAt,
      },
      create: {
        userId: user.id,
        encAccessToken,
        encRefreshToken,
        tokenType,
        scopes,
        expiresAt,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "oauth_callback_success",
        actorIp: req.ip,
        metadataJson: { xUserId: me.data.id },
      },
    });

    // Invalidate session
    await db.xAuthSession.delete({ where: { id: session.id } });

    return reply.redirect(session.postAuthRedirectUrl);
  });

  app.get("/v1/posts", async (req, reply) => {
    const user = await resolveRequestUser({ req, db, cfg });
    if (!user) return reply.code(401).send({ ok: false });

    const parsed = ListPostsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false });

    const q = parsed.data;
    const posts = await db.post.findMany({
      where: {
        userId: user.id,
        type: q.type ?? undefined,
        source: q.source ?? undefined,
        createdAt: q.beforeDate ? { lt: new Date(q.beforeDate) } : undefined,
        text: q.keyword ? { contains: q.keyword, mode: "insensitive" } : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { ok: true, posts };
  });

  app.post("/v1/scan", async (req, reply) => {
    const user = await resolveRequestUser({ req, db, cfg });
    if (!user) return reply.code(401).send({ ok: false });

    const token = await db.xToken.findUnique({ where: { userId: user.id } });
    if (!token) return reply.code(401).send({ ok: false });

    requireEncKey(cfg.tokenEncKeyBase64);
    const accessToken = decryptString({
      payload: token.encAccessToken as any,
      keyBase64: cfg.tokenEncKeyBase64,
      aad: user.id,
    });

    const xClient = xClientFactory(process.env);
    const me = await xClient.getMe(accessToken);

    const page = await xClient.listUserTweets(accessToken, {
      userId: me.data.id,
      maxResults: 100,
    });

    let upserted = 0;
    for (const t of page.data.data) {
      const ref = t.referenced_tweets?.[0];
      let type: PostTypeValue = PostType.NORMAL;
      let sourceTweetId: string | null = null;
      if (ref?.type === "replied_to") {
        type = PostType.REPLY;
        sourceTweetId = ref.id;
      } else if (ref?.type === "quoted") {
        type = PostType.QUOTE;
        sourceTweetId = ref.id;
      } else if (ref?.type === "retweeted") {
        type = PostType.REPOST;
        sourceTweetId = ref.id;
      }

      await db.post.upsert({
        where: { id: t.id },
        update: {
          text: t.text,
          createdAt: t.created_at ? new Date(t.created_at) : new Date(),
          type,
          sourceTweetId,
          lastSeenAt: new Date(),
        },
        create: {
          id: t.id,
          userId: user.id,
          text: t.text,
          createdAt: t.created_at ? new Date(t.created_at) : new Date(),
          type,
          source: "API_SCAN",
          sourceTweetId,
        },
      });
      upserted++;
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "scan_finished",
        actorIp: req.ip,
        metadataJson: { scanned: page.data.data.length, upserted },
      },
    });

    return {
      ok: true,
      userId: user.id,
      xUserId: user.xUserId,
      scanned: page.data.data.length,
      upserted,
    };
  });

  app.post("/v1/deletions", async (req, reply) => {
    const user = await resolveRequestUser({ req, db, cfg });
    if (!user) return reply.code(401).send({ ok: false });

    const parsed = CreateDeletionJobRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false });
    const body = parsed.data as CreateDeletionJobRequest;

    const dryRun = body.dryRun ?? true;

    const where: any = { userId: user.id };
    const types = body.filters?.types;
    if (types?.length) where.type = { in: types };
    if (body.filters?.beforeDate) where.createdAt = { lt: new Date(body.filters.beforeDate) };
    if (body.filters?.keyword) where.text = { contains: body.filters.keyword, mode: "insensitive" };

    const posts = (await db.post.findMany({ where, take: 5000 })) as Array<{
      id: string;
    }>;
    const job = await db.deletionJob.create({
      data: {
        userId: user.id,
        dryRun,
        status: "PENDING",
        items: {
          create: posts.map((p) => ({
            postId: p.id,
          })),
        },
      },
      include: { items: true },
    });

    if (posts.length) {
      await db.post.updateMany({
        where: { userId: user.id, id: { in: posts.map((p) => p.id) } },
        data: { deletionStatus: "PENDING", errorMessage: null },
      });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "deletion_job_created",
        actorIp: req.ip,
        metadataJson: { jobId: job.id, dryRun, items: job.items.length },
      },
    });

    try {
      await enqueueDeletionJob(job.id);
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "deletion_job_enqueued",
          actorIp: req.ip,
          metadataJson: { jobId: job.id },
        },
      });
    } catch (err) {
      await db.deletionJob.update({
        where: { id: job.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "deletion_job_enqueue_failed",
          actorIp: req.ip,
          metadataJson: { jobId: job.id, error: String((err as Error).message ?? err) },
        },
      });
      return reply.code(503).send({ ok: false, error: "queue_unavailable", jobId: job.id });
    }

    return {
      ok: true,
      jobId: job.id,
      dryRun,
      items: job.items.length,
      statusUrl: `/jobs/${job.id}`,
    };
  });

  app.get("/v1/deletions/:id", async (req, reply) => {
    const user = await resolveRequestUser({ req, db, cfg });
    if (!user) return reply.code(401).send({ ok: false });

    const id = (req.params as any).id as string;
    const job = await db.deletionJob.findFirst({
      where: { id, userId: user.id },
      include: {
        items: {
          include: { post: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!job) return reply.code(404).send({ ok: false });
    const items = job.items as Array<{
      id: string;
      postId: string;
      status: string;
      attempts: number;
      lastError: string | null;
      rateLimitResetAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      post?: { text: string; type: string; source: string; createdAt: Date };
    }>;
    const counts = countItemStatuses(items);
    const itemSummary = items.map((item) => ({
      id: item.id,
      postId: item.postId,
      status: item.status,
      attempts: item.attempts,
      lastError: item.lastError,
      rateLimitResetAt: item.rateLimitResetAt,
      text: item.post?.text,
      type: item.post?.type,
      source: item.post?.source,
      postCreatedAt: item.post?.createdAt,
      updatedAt: item.updatedAt,
    }));
    return { ok: true, job, counts, items: itemSummary };
  });

  app.get("/v1/deletions/:id/export.json", async (req, reply) => {
    const user = await resolveRequestUser({ req, db, cfg });
    if (!user) return reply.code(401).send({ ok: false });

    const id = (req.params as any).id as string;
    const job = await db.deletionJob.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { post: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!job) return reply.code(404).send({ ok: false });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "export_generated",
        actorIp: req.ip,
        metadataJson: { jobId: id, format: "json" },
      },
    });

    return reply
      .header("content-type", "application/json")
      .header("content-disposition", `attachment; filename="deletion-job-${id}.json"`)
      .send({ job });
  });

  app.get("/v1/deletions/:id/export.csv", async (req, reply) => {
    const user = await resolveRequestUser({ req, db, cfg });
    if (!user) return reply.code(401).send({ ok: false });

    const id = (req.params as any).id as string;
    const job = await db.deletionJob.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { post: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!job) return reply.code(404).send("not found");

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "export_generated",
        actorIp: req.ip,
        metadataJson: { jobId: id, format: "csv" },
      },
    });

    const header = [
      "postId",
      "type",
      "source",
      "text",
      "status",
      "attempts",
      "lastError",
      "rateLimitResetAt",
      "createdAt",
    ].map(csvCell).join(",");
    const lines = (job.items as Array<{
      postId: string;
      status: string;
      attempts: number;
      lastError: string | null;
      rateLimitResetAt: Date | null;
      createdAt: Date;
      post?: {
        type: string;
        source: string;
        text: string;
      };
    }>).map((it) =>
      [
        it.postId,
        it.post?.type ?? "",
        it.post?.source ?? "",
        it.post?.text ?? "",
        it.status,
        it.attempts,
        it.lastError ?? "",
        it.rateLimitResetAt,
        it.createdAt,
      ].map(csvCell).join(",")
    );
    const csv = [header, ...lines].join("\n");
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="deletion-job-${id}.csv"`)
      .send(csv);
  });
}

