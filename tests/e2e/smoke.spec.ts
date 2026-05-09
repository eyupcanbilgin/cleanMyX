import { expect, test } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";

const tokenKey = Buffer.from("x".repeat(32)).toString("base64");
let workerProcess: ChildProcess | undefined;

test.beforeAll(() => {
  execFileSync("pnpm", ["-C", "apps/worker", "build"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TOKEN_ENC_KEY: tokenKey,
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/xcleaner?schema=public",
      REDIS_URL: "redis://localhost:6379",
      X_USE_REAL: "false",
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  workerProcess = spawn("node", ["apps/worker/dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TOKEN_ENC_KEY: tokenKey,
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/xcleaner?schema=public",
      REDIS_URL: "redis://localhost:6379",
      X_USE_REAL: "false",
    },
    shell: process.platform === "win32",
    stdio: "pipe",
  });
});

test.afterAll(() => {
  workerProcess?.kill();
});

test("home loads and shows connect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("X Account Cleaner")).toBeVisible();
  await expect(page.getByRole("link", { name: /X ile Bağlan/i })).toBeVisible();
});

test("mock flow scans, previews, creates a dry-run job, and shows progress", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Dashboard")).toBeVisible();

  await page.getByRole("button", { name: /Scan Posts/i }).click();
  await expect(page).toHaveURL(/\/preview\?userId=mock-user-1/);
  await expect(page.getByText("Hello from mock")).toBeVisible();

  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/confirm\?/);
  await expect(page.getByRole("checkbox")).toBeChecked();

  await page.getByRole("button", { name: /Create Deletion Job/i }).click();
  await expect(page).toHaveURL(/\/jobs\/.+userId=mock-user-1/);
  await expect(page.getByText(/Status:\s+COMPLETED/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Dry-run skipped")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export JSON" })).toHaveAttribute(
    "href",
    /export\.json\?userId=mock-user-1/
  );
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
    "href",
    /export\.csv\?userId=mock-user-1/
  );
});
