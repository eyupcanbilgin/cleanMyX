import { test, expect } from "@playwright/test";

test("home loads and shows connect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("X Account Cleaner")).toBeVisible();
  await expect(page.getByRole("link", { name: /X ile Bağlan/i })).toBeVisible();
});

test("dashboard loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Dashboard")).toBeVisible();
  await expect(page.getByRole("button", { name: /Scan Posts/i })).toBeVisible();
});

