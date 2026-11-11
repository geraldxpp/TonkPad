import { expect, test } from "@playwright/test";

// This build is production-like: no launchpad network is connected (NEXT_PUBLIC_TONK_NETWORK is empty).
test("Portfolio asks for a wallet in production, and its routes check what they are given", async ({ page, request }) => {
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 1, name: "A little more perspective." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Connect to see your portfolio." })).toBeVisible();
  for (const path of ["/api/portfolio/sol/nope", "/api/portfolio/eth/0x7a5e00000000000000000000000000000000c0de", "/api/portfolio/market?range=5Y"]) {
    expect((await request.get(path)).status(), path).toBe(400);
  }
});

test("Launch stays coming soon, and the launchpad's routes are closed, where no network is connected", async ({ page, request }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { level: 1, name: "Launch (Creator Studio)" })).toBeVisible();
  await expect(page.getByText("Coming in a later module")).toBeVisible();
  await expect(page.getByText("Testnet", { exact: true })).toHaveCount(0);
  const settings = await request.get("/api/tonk/settings");
  expect(settings.status()).toBe(404);
  expect(await settings.json()).toEqual({ error: "closed" });
});
