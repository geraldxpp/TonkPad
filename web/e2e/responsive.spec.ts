import { expect, type Page, test } from "@playwright/test";
import { openExplore } from "./helpers";

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

test.describe("under 768 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no horizontal page scroll at 390 px", async ({ page }) => {
    await openExplore(page);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("the rail becomes a horizontal bar above the content", async ({ page }) => {
    await openExplore(page);
    const rail = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    const header = await page.getByRole("banner").boundingBox();
    expect(rail!.width).toBe(390);
    expect(rail!.height).toBeLessThan(90);
    expect(header!.y).toBeGreaterThanOrEqual(rail!.y + rail!.height - 1);
  });

  test("the hero stacks above Live scope and the cards go two across", async ({ page }) => {
    await openExplore(page);
    const pick = await page.getByRole("link", { name: "Buy Ghosty" }).boundingBox();
    const scope = await page.getByRole("region", { name: "Live scope" }).boundingBox();
    expect(scope!.y).toBeGreaterThan(pick!.y);

    const cards = page.getByRole("region", { name: "Heating up now" }).getByRole("link", { name: /market cap/ });
    const [a, b, c] = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
    expect(a!.y).toBe(b!.y);
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(b!.x + b!.width).toBeLessThanOrEqual(390);
  });

  test("the token table scrolls inside its own box", async ({ page }) => {
    await openExplore(page);
    const panel = page.getByRole("tabpanel");
    const sizes = await panel.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await panel.evaluate((el) => el.scrollTo({ left: 400 }));
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
