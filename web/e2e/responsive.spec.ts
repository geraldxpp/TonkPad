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

    const hero = await page.getByRole("heading", { name: /Every launch/ }).boundingBox();
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
