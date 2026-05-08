import { describe, expect, it, vi } from "vitest";

// Avoid requiring a generated Prisma client in scaffold tests.
vi.mock("../prisma.js", () => ({ prisma: {} }));

describe("api scaffold", () => {
  it("health returns ok", async () => {
    const { buildServer } = await import("./server.js");
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    await app.close();
  });
});

