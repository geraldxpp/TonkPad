import { expect, type Page, test } from "@playwright/test";
import { openExplore, tokenTable } from "./helpers";

async function openToken(page: Page, path = "/token/GHOST"): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

const search = (page: Page) => page.evaluate(() => window.location.search);
const tradePanel = (page: Page) => page.getByRole("region", { name: "Trade", exact: true });

test("Explore opens Ghosty's screen: header, stats and About", async ({ page }) => {
  await openExplore(page);
  await tokenTable(page).getByRole("link", { name: "Ghosty" }).click();
  await expect(page).toHaveURL(/\/token\/GHOST$/);
  await expect(page).toHaveTitle("Ghosty — Tonkpad.fun");
  await expect(page.getByRole("heading", { level: 1, name: "Ghosty" })).toBeVisible();
  for (const badge of ["Locked Mission", "Crew Rewards 2%", "Agent live", "Mission score 94"]) {
    await expect(page.getByText(badge, { exact: true })).toBeVisible();
  }
  const stats = page.getByRole("region", { name: "Token stats" });
  for (const text of ["$186K", "1,284 txns", "8.4 ETH", "+96 · 1h", "18.2%", "healthy", "180-day vest"]) {
    await expect(stats.getByText(text, { exact: true })).toBeVisible();
  }
  const about = page.getByRole("region", { name: "About $GHOST" });
  await expect(about.getByText("Oct 18 · 14:22")).toBeVisible();
  await expect(about.getByText("2.5% (2% to crew)")).toBeVisible();
});

test("header: copy the contract, the token's links, share and the watchlist", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Desktop browsers without a share sheet copy the link instead.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }));
  await openToken(page);
  await page.getByRole("button", { name: "Copy contract address 0x5e1d…a0f3" }).click();
  await expect(page.getByText("Contract address copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("0x5e1d7c4b92a03f6e18d5b7c2a94e6f01d3c8a0f3");

  await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://ghosty.example/");
  await expect(page.getByRole("link", { name: "Community" })).toHaveAttribute("target", "_blank");

  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText("Link copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/token\/GHOST$/);

  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();
});

test("chart: timeframe and value live in the URL and drive the readout", async ({ page }) => {
  await openToken(page);
  const chart = page.getByRole("region", { name: "Price chart" });
  const readout = chart.getByTestId("chart-readout");
  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(readout.locator(":scope > span")).toHaveText(["O $58.7K", "H $58.9K", "L $58.0K", "C $58.2K", "−0.87%", "Vol 2.14 ETH"]);
  await expect(chart.getByText("Graduation ≈ $70K")).toBeVisible();
  await expect(chart.getByText("0x7f3a…e8d1 bought 0.27 ETH")).toBeVisible();

  await chart.getByRole("button", { name: "1h", exact: true }).click();
  await expect.poll(() => search(page)).toBe("?tf=1h");
  await expect(chart.getByRole("button", { name: "1h", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(readout).toContainText("Vol 6.92 ETH");

  await chart.getByRole("button", { name: "Price", exact: true }).click();
  await expect.poll(() => search(page)).toBe("?tf=1h&chart=price");
  await expect(readout).toContainText("C $0.0000582");

  await page.reload();
  await expect(page.getByRole("region", { name: "Price chart" }).getByTestId("chart-readout")).toContainText("C $0.0000582");
});

test("chart: indicators switch the volume and the buy marks; full screen opens and closes", async ({ page }) => {
  await openToken(page);
  const chart = page.getByRole("region", { name: "Price chart" });
  const indicators = chart.getByRole("button", { name: /Indicators/ });
  await expect(chart.locator('[title="Whale buy"]')).toHaveCount(1);

  await indicators.click();
  await expect(indicators).toHaveAttribute("aria-expanded", "true");
  await chart.getByRole("checkbox", { name: "Whale and smart-wallet buys" }).uncheck();
  await expect(chart.locator('[title="Whale buy"]')).toHaveCount(0);
  await expect(indicators).toContainText("1");
  await page.keyboard.press("Escape");
  await expect(indicators).toHaveAttribute("aria-expanded", "false");
  await expect(indicators).toBeFocused();

  await chart.getByRole("button", { name: "Full screen chart" }).click();
  await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.getByRole("button", { name: "Full screen chart" })).toBeVisible();
});

test("activity: tabs in the URL, arrow keys between tabs, Show more and less", async ({ page }) => {
  await openToken(page);
  const activity = page.getByRole("region", { name: "Activity" });
  const trades = activity.getByRole("table", { name: "Trades" });
  await expect(trades.getByRole("row")).toHaveCount(9);
  await activity.getByRole("button", { name: "Show more" }).click();
  await expect(trades.getByRole("row")).toHaveCount(17);
  await activity.getByRole("button", { name: "Show less" }).click();
  await expect(trades.getByRole("row")).toHaveCount(9);

  await activity.getByRole("tab", { name: "Holders · 1,204" }).click();
  await expect.poll(() => search(page)).toBe("?tab=holders");
  const holders = activity.getByRole("table", { name: "Holders" });
  await expect(holders.getByText("Bonding curve")).toBeVisible();
  await expect(holders.getByRole("row")).toHaveCount(7);

  await page.keyboard.press("ArrowRight");
  await expect(activity.getByRole("tab", { name: "Top traders" })).toBeFocused();
  await expect.poll(() => search(page)).toBe("?tab=traders");
  await expect(activity.getByRole("table", { name: "Top traders" }).getByText("+$4,812")).toBeVisible();
});

test("trade panel: sides, presets and amounts decide what you get and whether you can trade", async ({ page }) => {
  await openToken(page);
  const trade = tradePanel(page);
  await expect(trade.getByText("Balance 0 ETH on Robinhood Chain")).toBeVisible();
  await expect(trade.getByText("2.93M", { exact: true })).toBeVisible();
  await expect(trade.getByText("Min. 2.49M at 15% slippage")).toBeVisible();
  await expect(trade.getByRole("button", { name: "Not enough ETH on Robinhood Chain" })).toHaveAttribute("aria-disabled", "true");
  await expect(trade.getByText("Fee 2.5% · 2% goes to the crew · routed via Tonkpad curve")).toBeVisible();

  await trade.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(trade.getByLabel("You sell")).toHaveValue("1");
  await expect(trade.getByText("0.0171", { exact: true })).toBeVisible();
  await expect(trade.getByRole("button", { name: "Sell 1M $GHOST" })).toBeVisible();
  await trade.getByRole("group", { name: "Amount presets" }).getByRole("button", { name: "Max" }).click();
  await expect(trade.getByLabel("You sell")).toHaveValue("3.13");
  await trade.getByLabel("You sell").fill("5");
  await expect(trade.getByRole("button", { name: "Not enough $GHOST" })).toBeVisible();
  await trade.getByLabel("You sell").fill("");
  await expect(trade.getByRole("button", { name: "Enter an amount" })).toBeVisible();

  await trade.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(trade.getByLabel("You pay")).toHaveValue("0.05");
  await expect(trade.getByRole("button", { name: /Need funds on Robinhood Chain/ })).toBeVisible();
});

test("bridge dialog works by keyboard and funds the buy", async ({ page }) => {
  await openToken(page);
  const trade = tradePanel(page);
  const banner = trade.getByRole("button", { name: /Need funds on Robinhood Chain/ });
  const dialog = page.getByRole("dialog", { name: "Bridge to Robinhood Chain" });

  await banner.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("853.40 USDC")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(banner).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab"); // Base
  await page.keyboard.press("Tab"); // Arbitrum
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "Arbitrum" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText("Across", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab"); // Ethereum
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("0.2512 ETH")).toBeVisible();
  await page.keyboard.press("Tab"); // Solana
  await page.keyboard.press("Tab"); // Bridge & Ready Wallet
  await expect(dialog.getByRole("button", { name: "Bridge & Ready Wallet" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(trade.getByText("Bridged 0.25 ETH to Robinhood Chain via Relay. Ready to buy.")).toBeVisible();
  await expect(trade.getByText("Balance 0.25 ETH on Robinhood Chain")).toBeVisible();
  const buy = trade.getByRole("button", { name: "Buy $GHOST · 0.05 ETH" });
  await expect(buy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trade.getByText("Trading opens soon: nothing was bought or sold.")).toBeVisible();

  // More than the wallet holds brings the banner back; a click on the backdrop closes the dialog.
  await trade.getByLabel("You pay").fill("0.5");
  await trade.getByRole("button", { name: /Need funds on Robinhood Chain/ }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
});

test("Captain Boo answers quick and typed questions from the token's data", async ({ page }) => {
  await openToken(page);
  const boo = page.getByRole("region", { name: "Captain Boo" });
  const log = boo.getByRole("log", { name: "Chat with Captain Boo" });
  await expect(log.getByText("Dev lock: 80% locked (162d left)")).toBeVisible();

  await boo.getByRole("button", { name: "How much has the crew earned?" }).click();
  await expect(log.getByText("The crew has pocketed $14,280 so far.", { exact: false })).toBeVisible();

  const input = boo.getByLabel("Ask Captain Boo");
  await input.fill("what's the status?");
  await input.press("Enter");
  await expect(log.getByText(/^Mission brief:/)).toBeVisible();
  await expect(log.getByText("Price: $0.0000582")).toBeVisible();
  await expect(input).toHaveValue("");
});

test("other mock tokens get the same screen from their own figures; unknown ones are not found", async ({ page }) => {
  await openToken(page, "/token/SCAT");
  await expect(page.getByRole("heading", { level: 1, name: "Sol Cat" })).toBeVisible();
  // Locked Missions and crew rewards are Tonkpad's; Sol Cat is a Bonk.fun token.
  await expect(page.getByText("Locked Mission", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Crew Rewards/)).toHaveCount(0);
  await expect(tradePanel(page).getByText("Balance 0 SOL on Solana")).toBeVisible();
  await expect(tradePanel(page).getByText("Routed via Jupiter")).toBeVisible();

  await page.goto("/token/NOPE");
  // Next streams this route: notFound() renders the 404 UI and noindex after
  // the initial HTTP 200 headers have already been sent.
  await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("every Tab stop on the token screen shows the focus ring", async ({ page }) => {
  await openToken(page);
  const missing: string[] = [];
  for (let i = 0; i < 140; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const target = el.matches("input[type=search]") ? (el.closest("label") as HTMLElement) : el;
      const s = getComputedStyle(target);
      const ring = s.outlineStyle === "solid" && s.outlineWidth === "2px" && s.outlineColor === "rgb(74, 156, 245)";
      return { label: `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)}`, ring };
    });
    if (!stop) break;
    if (!stop.ring) missing.push(stop.label);
  }
  expect(missing).toEqual([]);
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, theme] of [["de", "dark"], ["ru", "light"], ["de", "light"], ["ru", "dark"]] as const) {
    test(`no sideways scroll at 390 px (${lang}, ${theme})`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await openToken(page, `/${lang}/token/GHOST`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      const agent = page.getByRole("region", { name: "Captain Boo", exact: true });
      const log = agent.getByRole("log");
      const bubbles = log.locator(":scope > div > div");
      expect(await bubbles.evaluateAll((elements) => elements.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);
      // A pasted address or long question must wrap inside its own bubble too.
      await agent.getByRole("textbox").fill("x".repeat(280));
      await agent.getByRole("textbox").press("Enter");
      await expect(log.getByText("x".repeat(280), { exact: true })).toBeVisible();
      expect(await bubbles.evaluateAll((elements) => elements.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);
      expect(await log.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    });
  }
});
