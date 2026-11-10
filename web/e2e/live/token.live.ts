import { expect, test } from "@playwright/test";
import type { TokenDetail } from "../../src/shared/types/token-detail";
import { FIXTURE_TRADERS, FIXTURE_WORKER_URL, FRESH_ADDRESS, LIVE_ROBINHOOD, LIVE_SOLANA, UNKNOWN_ADDRESS } from "./fixtures";

test("each Explore selection opens its own live detail and survives reload", async ({ page }, testInfo) => {
  for (const token of [LIVE_SOLANA, LIVE_ROBINHOOD]) {
    await page.goto("/");
    await page.getByRole("table", { name: "Tokens" }).getByRole("link", { name: token.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/token/${token.address}$`));
    await expect(page).toHaveTitle(`${token.name} — tonkfun.fun`);
    await expect(page.getByRole("heading", { level: 1, name: token.name })).toBeVisible();
    const header = page.getByRole("region", { name: token.name, exact: true });
    const stats = page.getByRole("region", { name: "Token stats" });
    await expect(header.getByText(token.chain === "sol" ? "Solana" : "Robinhood Chain", { exact: true })).toBeVisible();
    await expect(stats.getByText(token.chain === "sol" ? "$62.1K" : "$41.2K", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ghosty", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: token.name })).toBeVisible();
    await expect(stats.getByText(token.chain === "sol" ? "$62.1K" : "$41.2K", { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("token-live-1440.png"), fullPage: true });
});

test("observed charts show the selected market history without mock trades or balances", async ({ page }) => {
  await page.goto(`/token/${LIVE_SOLANA.address}?tf=1m`);
  const chart = page.getByRole("region", { name: "Price chart" });
  await expect(chart.locator("canvas").first()).toBeVisible();
  // Price is the default once the supply is known; MCap is one click away.
  await expect(chart.getByTestId("chart-readout")).toContainText("C $0.0000621");
  await expect(chart.getByText("Observed market history; earlier candles may be unavailable.")).toBeVisible();
  await expect(chart.getByTestId("chart-readout")).not.toContainText("Vol");
  await expect(chart.getByRole("button", { name: /Indicators/ })).toHaveCount(0);
  await page.getByRole("group", { name: "Chart value" }).getByRole("button", { name: "MCap", exact: true }).click();
  await expect(chart.getByTestId("chart-readout")).toContainText("C $62.1K");

  await expect(page.getByText("Trade history is not available for this token yet.")).toBeVisible();
  const trade = page.getByRole("region", { name: "Trade", exact: true });
  // No simulated wallet: balances wait for a real one (e2e/live/wallet.live.ts).
  await expect(trade.getByText("Balance —")).toBeVisible();
  await expect(trade.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(trade.getByRole("button", { name: /Need funds/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ask Captain Boo/ })).toHaveCount(0);
  await expect(page.getByText("Crew Rewards 2%", { exact: true })).toHaveCount(0);
});

test("live trades and top traders come from the worker's trade book", async ({ page }) => {
  await page.goto(`/token/${LIVE_ROBINHOOD.address}`);
  const activity = page.getByRole("region", { name: "Activity" });
  const trades = activity.getByRole("table", { name: "Trades" });
  // A header row and the three curve trades, newest first.
  await expect(trades.getByRole("row")).toHaveCount(4);
  const newest = trades.getByRole("row").nth(1);
  await expect(newest.getByText("Sell", { exact: true })).toBeVisible();
  await expect(newest.getByText("$45.00", { exact: true })).toBeVisible();
  await expect(newest.getByText("0.0150", { exact: true })).toBeVisible();
  await expect(newest.getByText("0xaaaa…aaaa", { exact: true })).toBeVisible();
  await expect(newest.getByRole("link", { name: "View transaction" })).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/tx/0x${"3".padStart(64, "0")}`,
  );

  await activity.getByRole("tab", { name: "Top traders" }).click();
  const traders = activity.getByRole("table", { name: "Top traders" });
  // Only the wallet that has sold ranks: it bought for $30 and sold for $45.
  await expect(traders.getByRole("row")).toHaveCount(2);
  const top = traders.getByRole("row").nth(1);
  await expect(top.getByText("0xaaaa…aaaa", { exact: true })).toHaveAttribute("title", FIXTURE_TRADERS[0]);
  for (const text of ["+$15", "$30", "$45", "100%"]) await expect(top.getByText(text, { exact: true })).toBeVisible();
});

test("a fresh token shows unavailable facts instead of invented candles", async ({ page }) => {
  await page.goto(`/token/${FRESH_ADDRESS}`);
  await expect(page.getByRole("heading", { level: 1, name: "Fresh Launch" })).toBeVisible();
  const chart = page.getByRole("region", { name: "Price chart" });
  await expect(chart.getByText("Data unavailable", { exact: true })).toBeVisible();
  await expect(chart.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Chart value" }).getByRole("button", { name: "Price", exact: true })).toBeDisabled();
  // Market cap, volume, liquidity and holders; the lock and top 10 moved to Token insights.
  await expect(page.getByRole("region", { name: "Token stats" }).getByText("—", { exact: true })).toHaveCount(4);
});

test("German live details fit a light-theme phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
  await page.goto(`/de/token/${LIVE_ROBINHOOD.address}`);
  await expect(page.getByRole("heading", { level: 1, name: LIVE_ROBINHOOD.name })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("region", { name: "Kurschart" }).locator("canvas").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("token-live-390-de-light.png"), fullPage: true });
});

test("worker auth and public unknown-token handling are preserved", async ({ request, page }) => {
  const denied = await request.get(`${FIXTURE_WORKER_URL}/v1/token/${LIVE_SOLANA.address}`);
  expect(denied.status()).toBe(401);
  const detail = await request.get(`/api/live/token/${LIVE_ROBINHOOD.address.toUpperCase().replace("0X", "0x")}`);
  expect(detail.ok()).toBe(true);
  expect(await detail.json()).toMatchObject({ source: "live", contract: LIVE_ROBINHOOD.address, token: { name: LIVE_ROBINHOOD.name } });
  const unknown = await request.get(`/api/live/token/${UNKNOWN_ADDRESS}`);
  expect(unknown.status()).toBe(404);
  await page.goto(`/token/${UNKNOWN_ADDRESS}`);
  // While the page streams in, a hidden copy can sit beside the shown one for a moment.
  await expect(page.getByText("This token is no longer available in the live feed.").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ghosty", exact: true })).toHaveCount(0);
});

test("a failed refresh retains the newest successful live detail", async ({ page, request }) => {
  const response = await request.get(`/api/live/token/${LIVE_SOLANA.address}`);
  expect(response.ok()).toBe(true);
  const latest: TokenDetail = await response.json();
  latest.token.marketCap = 79_400;
  latest.priceUsd = 0.0000794;
  latest.updatedAt += 4_000;
  let interrupted = false;
  await page.route(`**/api/live/token/${LIVE_SOLANA.address}`, (route) => route.fulfill(interrupted
    ? { status: 502, json: { error: "fixture interruption" } }
    : { status: 200, json: latest }));
  await page.goto(`/token/${LIVE_SOLANA.address}`);
  const stats = page.getByRole("region", { name: "Token stats" });
  await expect(stats.getByText("$79.4K", { exact: true })).toBeVisible({ timeout: 10_000 });
  interrupted = true;
  await expect(page.getByText("Live updates are interrupted. Showing the last available data.")).toBeVisible({ timeout: 10_000 });
  await expect(stats.getByText("$79.4K", { exact: true })).toBeVisible();
  await expect(stats.getByText("$62.1K", { exact: true })).toHaveCount(0);
});
