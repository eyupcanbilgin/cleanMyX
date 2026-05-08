import type { FastifyInstance } from "fastify";
import { getConfig } from "../config.js";
import { prisma } from "../prisma.js";
import { encryptString, decryptString } from "@xcleaner/crypto";
import { createXApiClient } from "@xcleaner/x-client";
import {
  CreateDeletionJobRequestSchema,
  ListPostsQuerySchema,
  PostType,
  type CreateDeletionJobRequest,
  type PostType as PostTypeValue,
} from "@xcleaner/shared";

import crypto from "node:crypto";

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

function getUserIdFromHeader(req: { headers: Record<string, any> }): string {
  const v = req.headers["x-user-id"];
  if (!v || typeof v !== "string") {
    throw new Error("Missing x-user-id header (scaffold auth)");
  }
  return v;
}

export async function registerRoutes(app: FastifyInstance) {
  const cfg = getConfig();

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

    await prisma.xAuthSession.create({
      data: {
        state,
        encCodeVerifier,
        expiresAt,
        postAuthRedirectUrl: redirectUrl,
      },
    });

    await prisma.auditLog.create({
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
      await prisma.auditLog.create({
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
    const session = await prisma.xAuthSession.findUnique({ where: { state } });
    if (!session) return reply.code(400).send({ ok: false });
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.xAuthSession.delete({ where: { id: session.id } });
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
        await prisma.auditLog.create({
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
    const xClient = createXApiClient(process.env);
    const me = await xClient.getMe(accessToken);

    const user = await prisma.user.upsert({
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

    await prisma.xToken.upsert({
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

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "oauth_callback_success",
        actorIp: req.ip,
        metadataJson: { xUserId: me.data.id },
      },
    });

    // Invalidate session
    await prisma.xAuthSession.delete({ where: { id: session.id } });

    return reply.redirect(session.postAuthRedirectUrl);
  });

  app.get("/v1/posts", async (req, reply) => {
    const userId = getUserIdFromHeader(req);
    const parsed = ListPostsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false });

    const q = parsed.data;
    const posts = await prisma.post.findMany({
      where: {
        userId,
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
    const userId = getUserIdFromHeader(req);
    const token = await prisma.xToken.findUnique({ where: { userId } });
    if (!token) return reply.code(401).send({ ok: false });

    requireEncKey(cfg.tokenEncKeyBase64);
    const accessToken = decryptString({
      payload: token.encAccessToken as any,
      keyBase64: cfg.tokenEncKeyBase64,
      aad: userId,
    });

    const xClient = createXApiClient(process.env);
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

      await prisma.post.upsert({
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
          userId,
          text: t.text,
          createdAt: t.created_at ? new Date(t.created_at) : new Date(),
          type,
          source: "API_SCAN",
          sourceTweetId,
        },
      });
      upserted++;
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: "scan_finished",
        actorIp: req.ip,
        metadataJson: { upserted },
      },
    });

    return { ok: true, scanned: page.data.data.length, upserted };
  });

  app.post("/v1/deletions", async (req, reply) => {
    const userId = getUserIdFromHeader(req);
    const parsed = CreateDeletionJobRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false });
    const body = parsed.data as CreateDeletionJobRequest;

    const dryRun = body.dryRun ?? true;

    const where: any = { userId };
    const types = body.filters?.types;
    if (types?.length) where.type = { in: types };
    if (body.filters?.beforeDate) where.createdAt = { lt: new Date(body.filters.beforeDate) };
    if (body.filters?.keyword) where.text = { contains: body.filters.keyword, mode: "insensitive" };

    const posts = (await prisma.post.findMany({ where, take: 5000 })) as Array<{
      id: string;
    }>;
    const job = await prisma.deletionJob.create({
      data: {
        userId,
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

    await prisma.auditLog.create({
      data: {
        userId,
        action: "deletion_job_created",
        actorIp: req.ip,
        metadataJson: { jobId: job.id, dryRun, items: job.items.length },
      },
    });

    return { ok: true, jobId: job.id, dryRun, items: job.items.length };
  });

  app.get("/v1/deletions/:id", async (req, reply) => {
    const userId = getUserIdFromHeader(req);
    const id = (req.params as any).id as string;
    const job = await prisma.deletionJob.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!job) return reply.code(404).send({ ok: false });
    const items = job.items as Array<{ status: string }>;
    const counts = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.status] = (acc[it.status] ?? 0) + 1;
      return acc;
    }, {});
    return { ok: true, job, counts };
  });

  app.get("/v1/deletions/:id/export.json", async (req, reply) => {
    const userId = getUserIdFromHeader(req);
    const id = (req.params as any).id as string;
    const job = await prisma.deletionJob.findFirst({
      where: { id, userId },
      include: { items: { include: { post: true } } },
    });
    if (!job) return reply.code(404).send({ ok: false });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "export_generated",
        actorIp: req.ip,
        metadataJson: { jobId: id, format: "json" },
      },
    });

    return reply
      .header("content-type", "application/json")
      .send({ job });
  });

  app.get("/v1/deletions/:id/export.csv", async (req, reply) => {
    const userId = getUserIdFromHeader(req);
    const id = (req.params as any).id as string;
    const job = await prisma.deletionJob.findFirst({
      where: { id, userId },
      include: { items: { include: { post: true } } },
    });
    if (!job) return reply.code(404).send("not found");

    await prisma.auditLog.create({
      data: {
        userId,
        action: "export_generated",
        actorIp: req.ip,
        metadataJson: { jobId: id, format: "csv" },
      },
    });

    const header = ["postId", "status", "attempts", "lastError", "createdAt"].join(",");
    const lines = (job.items as Array<{
      postId: string;
      status: string;
      attempts: number;
      lastError: string | null;
      createdAt: Date;
    }>).map((it) =>
      [
        it.postId,
        it.status,
        String(it.attempts),
        JSON.stringify(it.lastError ?? ""),
        it.createdAt.toISOString(),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .send(csv);
  });
}

