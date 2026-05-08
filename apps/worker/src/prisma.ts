import { PrismaClient } from "@prisma/client";

declare global {
  var __worker_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__worker_prisma ??
  new PrismaClient({
    log: [],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__worker_prisma = prisma;
}

