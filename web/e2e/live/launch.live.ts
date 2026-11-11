import { expect, test } from "@playwright/test";

// This build is production-like: no launchpad network is connected (NEXT_PUBLIC_TONK_NETWORK is empty).
test("Bridge opens in production, and its routes check what they are given", async ({ page, request }) => {
  await page.goto("/bridge");
  await expect(page.getByRole("heading", { level: 1, name: "Your assets. More places." })).toBeVisible();
  for (const path of ["/api/bridge/quote?from=nope&to=rh&asset=USDC&receive=USDG&amount=1", "/api/bridge/quote?from=base&to=base&asset=USDC&receive=USDC&amount=1", "/api/bridge/quote?from=base&to=rh&asset=DOGE&receive=USDG&amount=1", "/api/bridge/quote?from=base&to=rh&asset=USDC&receive=USDG&amount=x", "/api/bridge/balance/base/nope", "/api/bridge/status?from=base&to=rh&tx=nope&provider=relay&sender=x&raw=1", "/api/bridge/tx?network=base&tx=nope"]) {
    expect((await request.get(path)).status(), path).toBe(400);
  }
  // Nothing is built until the switch is on.
  const build = await request.post("/api/bridge/build", { data: { from: "base", to: "rh", asset: "USDC", receive: "USDG", amount: "1000000", sender: "0x7a5e00000000000000000000000000000000c0de", recipient: "0x7a5e00000000000000000000000000000000c0de", routeId: "relay", reviewedOut: "1" } });
  expect([build.status(), await build.json()]).toEqual([403, { error: "closed" }]);
});

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
