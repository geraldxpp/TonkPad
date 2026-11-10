import { expect, test } from "@playwright/test";

// This build is production-like: no launchpad network is connected (NEXT_PUBLIC_TONK_NETWORK is empty).
test("Launch stays coming soon, and the launchpad's routes are closed, where no network is connected", async ({ page, request }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { level: 1, name: "Launch (Creator Studio)" })).toBeVisible();
  await expect(page.getByText("Coming in a later module")).toBeVisible();
  await expect(page.getByText("Testnet", { exact: true })).toHaveCount(0);
  const settings = await request.get("/api/tonk/settings");
  expect(settings.status()).toBe(404);
  expect(await settings.json()).toEqual({ error: "closed" });
});
