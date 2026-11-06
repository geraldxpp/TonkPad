import { expect, type Page, test } from "@playwright/test";
import { openExplore, tokenRows } from "./helpers";

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const width of [1280, 1024, 768]) {
  test(`at ${width} px nothing spills sideways and the hero sections don't overlap`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openExplore(page);
    expect(await horizontalOverflow(page)).toBe(0);

    const hero = await page.getByRole("heading", { name: "Launches." }).boundingBox();
    const scope = await page.getByRole("region", { name: "Live scope" }).boundingBox();
    expect(hero && scope).toBeTruthy();
    const overlaps =
      hero!.x < scope!.x + scope!.width && scope!.x < hero!.x + hero!.width &&
      hero!.y < scope!.y + scope!.height && scope!.y < hero!.y + hero!.height;
    expect(overlaps).toBe(false);

    // Both radar labels stay inside the Live scope card.
    for (const ticker of ["GHOST", "ORB"]) {
      const label = await page.locator(`[data-blip-label="${ticker}"]`).boundingBox();
      expect(label!.x).toBeGreaterThanOrEqual(scope!.x);
      expect(label!.x + label!.width).toBeLessThanOrEqual(scope!.x + scope!.width);
    }
  });
}

/** Visible column headers, in order. */
async function visibleColumns(page: Page): Promise<string[]> {
  return page
    .getByRole("table", { name: "Tokens" })
    .getByRole("columnheader")
    .evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null && !el.classList.contains("sr-only")).map((el) => el.textContent ?? ""),
    );
}

const TIERS: Array<[number, string[]]> = [
  [1440, ["#", "Token", "Bonding curve", "Mission score", "Last 24h", "24h", "Volume", "Holders", "Smart money", "Market cap", "Quick buy"]],
  [1366, ["#", "Token", "Bonding curve", "Mission score", "Last 24h", "24h", "Volume", "Market cap", "Quick buy"]],
  [1280, ["#", "Token", "Bonding curve", "Mission score", "Last 24h", "24h", "Volume", "Market cap", "Quick buy"]],
  [1024, ["#", "Token", "Mission score", "Last 24h", "24h", "Market cap", "Quick buy"]],
  [768, ["#", "Token", "24h", "Market cap", "Quick buy"]],
];

for (const [width, columns] of TIERS) {
  test(`at ${width} px the token table fits without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openExplore(page);
    expect(await visibleColumns(page)).toEqual(columns);
    const panel = page.getByRole("tabpanel");
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    // Every row stays on one line (no cell wraps under the others).
    const lines = await tokenRows(page).evaluateAll((rows) =>
      rows.map((row) => {
        const cells = [...row.children].filter((c) => (c as HTMLElement).offsetParent !== null);
        return new Set(cells.map((c) => { const b = c.getBoundingClientRect(); return Math.round((b.top + b.height / 2) / 6); })).size;
      }),
    );
    expect(lines.every((n) => n === 1)).toBe(true);
    // The table can't scroll sideways, so this only scrolls the page down to it.
    const quickBuy = page.getByRole("button", { name: "Quick buy 0.01 ETH of GHOST" });
    await quickBuy.scrollIntoViewIfNeeded();
    await expect(quickBuy).toBeInViewport({ ratio: 1 });
  });
}

for (const width of [1745, 2560]) {
  test(`at ${width} px the page fills the window with no empty band on the right`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openExplore(page);
    const main = await page.getByRole("main").boundingBox();
    expect(Math.round(main!.x + main!.width)).toBe(width);
    const panel = await page.getByRole("tabpanel").boundingBox();
    expect(width - (panel!.x + panel!.width)).toBeLessThanOrEqual(41);
    expect(await horizontalOverflow(page)).toBe(0);
  });
}

test.describe("under 768 px (phone layout)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const width of [390, 375, 360]) {
    test(`no horizontal page scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openExplore(page);
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }

  test("the rail becomes a seven-tab bar fixed to the bottom edge", async ({ page }) => {
    await openExplore(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    const box = await nav.boundingBox();
    expect(box!.width).toBe(390);
    expect(Math.round(box!.y + box!.height)).toBe(844);
    const tabs = nav.locator("a:visible, button:visible");
    await expect(tabs).toHaveText(["Explore", "Live", "Bridge", "Portfolio", "Launch", "Docs", "More"]);
    await expect(nav.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");

    // It stays put while the page scrolls.
    await page.mouse.wheel(0, 1600);
    await expect.poll(async () => Math.round((await nav.boundingBox())!.y + (await nav.boundingBox())!.height)).toBe(844);
  });

  test("the top bar is one sticky row: logo, search, alerts and wallet", async ({ page }) => {
    await openExplore(page);
    const header = page.getByRole("banner");
    expect((await header.boundingBox())!.height).toBeLessThan(70);
    await expect(header.getByRole("link", { name: "Tonkpad.fun home" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Alerts" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Connect wallet" })).toHaveText("Connect", { useInnerText: true });
    await expect(header.getByRole("searchbox")).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, 1800));
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
  });

  test("the hero stacks above Live scope and Mission Pick has a full-width Buy", async ({ page }) => {
    await openExplore(page);
    const buy = await page.getByRole("link", { name: "Buy Ghosty" }).boundingBox();
    const scope = await page.getByRole("region", { name: "Live scope" }).boundingBox();
    expect(scope!.y).toBeGreaterThan(buy!.y);
    expect(buy!.width).toBeGreaterThan(300);
  });

  test("Heating up is one swipeable row of cards", async ({ page }) => {
    await openExplore(page);
    const row = page.getByTestId("heating-cards");
    const cards = row.getByRole("link", { name: /market cap/ });
    const boxes = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
    expect(boxes[0]!.y).toBe(boxes[1]!.y);
    expect(boxes[1]!.y).toBe(boxes[2]!.y);
    const sizes = await row.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await row.evaluate((el) => el.scrollTo({ left: 600 }));
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("the token list is a compact four-column list that fits the screen", async ({ page }) => {
    await openExplore(page);
    const table = page.getByRole("table", { name: "Tokens" });
    await expect(table.getByRole("columnheader")).toHaveText(["Token", "Market cap", "24h", "Quick buy"]);
    await expect(tokenRows(page)).toHaveCount(10);
    const panel = page.getByRole("tabpanel");
    const sizes = await panel.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBe(sizes.client);
    await expect(page.getByRole("button", { name: "Quick buy 0.01 ETH of GHOST" })).toBeVisible();
  });
});
