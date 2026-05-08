import Fastify from "fastify";
import { createLoggerOptions } from "../logger.js";
import { registerRoutes } from "./routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: createLoggerOptions(),
    trustProxy: true,
  });

  await registerRoutes(app);
  return app;
}

