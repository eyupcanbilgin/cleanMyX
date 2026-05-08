import Fastify from "fastify";
import { createLogger } from "../logger.js";
import { registerRoutes } from "./routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: createLogger(),
    trustProxy: true,
  });

  await registerRoutes(app);
  return app;
}

