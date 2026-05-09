import Fastify from "fastify";
import { getConfig } from "../config.js";
import { createLoggerOptions } from "../logger.js";
import { registerRoutes, type RouteDeps } from "./routes.js";

export async function buildServer(routeDeps: RouteDeps = {}) {
  const cfg = getConfig();
  const app = Fastify({
    logger: createLoggerOptions(),
    trustProxy: true,
  });

  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    const allowOrigin =
      typeof origin === "string" && origin === cfg.webBaseUrl
        ? origin
        : cfg.webBaseUrl;
    reply.header("access-control-allow-origin", allowOrigin);
    reply.header(
      "access-control-allow-methods",
      "GET,POST,OPTIONS"
    );
    reply.header(
      "access-control-allow-headers",
      "content-type,x-user-id"
    );
  });

  app.options("/*", async (_req, reply) => reply.code(204).send());

  await registerRoutes(app, routeDeps);
  return app;
}

