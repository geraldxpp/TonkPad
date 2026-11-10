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

    const hero = await page.getByRole("heading", { level: 1 }).boundingBox();
    const coin = await page.getByRole("region", { name: "tonkfun.fun native coin, coming soon" }).boundingBox();
    expect(hero && coin).toBeTruthy();
    const overlaps =
      hero!.x < coin!.x + coin!.width && coin!.x < hero!.x + hero!.width &&
      hero!.y < coin!.y + coin!.height && coin!.y < hero!.y + hero!.height;
    expect(overlaps).toBe(false);

    // The launch radar opens under the list; both its labels stay inside the Live scope card.
    await page.getByTestId("radar-toggle").click();
    const scope = await page.getByRole("region", { name: "Live scope" }).boundingBox();
    expect(scope).toBeTruthy();
    expect(await horizontalOverflow(page)).toBe(0);
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
  [1440, ["#", "Token", "Bonding curve", "Mission score", "Last 24h", "24h", "Volume", "Holders", "Smart money", "Market cap", "Details"]],
  [1366, ["#", "Token", "Bonding curve", "Mission score", "Last 24h", "24h", "Volume", "Market cap", "Details"]],
  [1280, ["#", "Token", "Bonding curve", "Mission score", "Last 24h", "24h", "Volume", "Market cap", "Details"]],
  [1024, ["#", "Token", "Mission score", "Last 24h", "24h", "Market cap", "Details"]],
  [768, ["#", "Token", "24h", "Market cap", "Details"]],
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
    const open = page.getByRole("link", { name: "Open GHOST" });
    await open.scrollIntoViewIfNeeded();
    await expect(open).toBeInViewport({ ratio: 1 });
  });
}

for (const width of [1745, 2560]) {
  test(`at ${width} px the content fills up to a 1600 px column, centred beside the rail`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openExplore(page);
    const rail = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    const main = await page.getByRole("main").boundingBox();
    const column = width - (rail!.x + rail!.width);
    expect(Math.round(main!.width)).toBe(Math.min(1600, Math.round(column)));
    const left = main!.x - (rail!.x + rail!.width);
    const right = width - (main!.x + main!.width);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
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
    await expect(tabs).toHaveText(["Explore", "Swap", "Bridge", "Portfolio", "Launch", "Docs", "More"]);
    await expect(nav.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");

    // It stays put while the page scrolls.
    await page.mouse.wheel(0, 1600);
    await expect.poll(async () => Math.round((await nav.boundingBox())!.y + (await nav.boundingBox())!.height)).toBe(844);
  });

  test("the top bar is one sticky row: logo, search, language, theme, alerts and wallet", async ({ page }) => {
    await openExplore(page);
    const header = page.getByRole("banner");
    expect((await header.boundingBox())!.height).toBeLessThan(70);
    await expect(header.getByRole("link", { name: "tonkfun.fun home" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Language: English" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Alerts" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Connect wallet" })).toHaveText("Connect wallet", { useInnerText: true });
    await expect(header.getByRole("searchbox")).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, 1800));
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
  });

  test("the hero stacks: headline, the tonkfun.fun coin card, then the market figures", async ({ page }) => {
    await openExplore(page);
    const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
    const coin = await page.getByRole("region", { name: "tonkfun.fun native coin, coming soon" }).boundingBox();
    const market = await page.getByLabel("Market overview").boundingBox();
    expect(coin!.y).toBeGreaterThan(heading!.y);
    expect(market!.y).toBeGreaterThan(coin!.y + coin!.height - 1);
    expect(coin!.width).toBeGreaterThan(340);
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
    await expect(table.getByRole("columnheader")).toHaveText(["Token", "Market cap", "24h", "Details"]);
    await expect(tokenRows(page)).toHaveCount(10);
    const panel = page.getByRole("tabpanel");
    const sizes = await panel.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBe(sizes.client);
    await expect(page.getByRole("link", { name: "Open GHOST" })).toBeVisible();
  });
});
