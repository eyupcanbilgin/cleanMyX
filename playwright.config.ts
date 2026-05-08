import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: [
    {
      command: "pnpm -C apps/api build && node apps/api/dist/index.js",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: "4000",
        WEB_BASE_URL: "http://localhost:3000",
        API_BASE_URL: "http://localhost:4000",
        TOKEN_ENC_KEY: Buffer.from("x".repeat(32)).toString("base64"),
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/xcleaner?schema=public",
        REDIS_URL: "redis://localhost:6379",
        X_USE_REAL: "false",
      },
    },
    {
      command: "pnpm -C apps/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
      },
    },
  ],
  use: {
    baseURL: "http://localhost:3000",
  },
});

