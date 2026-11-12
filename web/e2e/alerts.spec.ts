import { expect, type Page, test } from "@playwright/test";

// The demo build: prices come from /api/live/prices, stubbed here so the alert crosses on the first check.
const GHOST_PRICE = { address: "GHOST", chain: "sol", symbol: "GHOST", name: "Ghosty", priceUsd: 1, marketCap: 1_000_000_000, change1h: 0, change24h: 0, at: 1 };

async function openGhost(page: Page): Promise<void> {
  await page.route("**/api/live/prices**", (route) => route.fulfill({ json: { prices: [GHOST_PRICE] } }));
  await page.goto("/token/GHOST");
  await page.waitForLoadState("networkidle");
}

test("an alert set on a token page fires when the price crosses it: a toast, the bell's count and the feed", async ({ page }, testInfo) => {
  await openGhost(page);
  const bells = page.getByRole("button", { name: "Alerts", exact: true });
  await expect(bells.first()).toBeVisible();

  await page.getByRole("button", { name: "Set an alert for GHOST" }).click();
  const form = page.getByRole("dialog", { name: "Alert me when…" });
  await expect(form.getByRole("textbox", { name: "Level in USD" })).not.toHaveValue("");
  await form.getByRole("button", { name: "Set alert" }).click();
  await expect(form).toBeHidden();

  await expect(page.getByRole("status", { name: "Alert" })).toContainText("GHOST rose above");
  const unread = page.getByRole("button", { name: "Alerts, 1 new" });
  await expect(unread.first()).toBeVisible();
  await unread.first().click();
  const panel = page.getByRole("dialog", { name: "Alerts" });
  await expect(panel.getByRole("link", { name: /GHOST rose above/ })).toBeVisible();
  await expect(bells.first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("alerts-feed-1440.png") });

  await panel.getByRole("tab", { name: /My alerts/ }).click();
  await expect(panel.getByRole("switch", { name: /GHOST: Price above/ })).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByRole("switch", { name: "tonkfun.fun: Every new launch" })).toBeVisible();
  await expect(panel.getByRole("switch", { name: "Pump.fun: Graduations" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("alerts-rules-1440.png") });
});

test("the alerts panel fits a phone without sideways scroll, in German", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/live/prices**", (route) => route.fulfill({ json: { prices: [] } }));
  await page.goto("/de/token/GHOST");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Alarm für GHOST einstellen" }).click();
  await page.getByRole("dialog", { name: "Benachrichtige mich, wenn …" }).getByRole("button", { name: "Alarm einstellen" }).click();
  await page.getByRole("button", { name: "Alarme", exact: true }).first().click();
  const panel = page.getByRole("dialog", { name: "Alarme" });
  await panel.getByRole("tab", { name: /Meine Alarme/ }).click();
  await expect(panel.getByRole("switch", { name: /GHOST: Preis über/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("alerts-rules-390-de.png") });
});
