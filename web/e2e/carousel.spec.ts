import { expect, type Page, test } from "@playwright/test";
import { openExplore } from "./helpers";

const row = (page: Page) => page.getByTestId("heating-cards");
const scrollLeft = (page: Page) => row(page).evaluate((el) => el.scrollLeft);

test.describe("Heating up carousel", () => {
  test.beforeEach(async ({ page }) => {
    await openExplore(page);
    await row(page).scrollIntoViewIfNeeded();
    await page.mouse.move(5, 5);
  });

  test("glides on its own", async ({ page }) => {
    const start = await scrollLeft(page);
    await expect.poll(() => scrollLeft(page), { timeout: 3000 }).toBeGreaterThan(start + 20);
  });

  test("pauses while hovered and resumes after", async ({ page }) => {
    await row(page).hover();
    await page.waitForTimeout(150);
    const held = await scrollLeft(page);
    await page.waitForTimeout(700);
    expect(await scrollLeft(page)).toBe(held);
    await page.mouse.move(5, 5);
    await expect.poll(() => scrollLeft(page), { timeout: 3000 }).toBeGreaterThan(held + 10);
  });

  test("pauses while a card has keyboard focus", async ({ page }) => {
    await page.getByRole("link", { name: /^Sol Cat, market cap/ }).focus();
    await page.waitForTimeout(150);
    const held = await scrollLeft(page);
    await page.waitForTimeout(700);
    expect(await scrollLeft(page)).toBe(held);
  });

  test("Next and Previous step one card", async ({ page }) => {
    // Start mid-copy. The reel glides on its own, and a step back from near the start wraps round by one copy,
    // so a start that had drifted near either end made the step look wrong (a timing flake under load).
    const loop = await row(page).evaluate((el) => {
      const track = el.firstElementChild as HTMLElement;
      return (track.children[1] as HTMLElement).offsetLeft - (track.children[0] as HTMLElement).offsetLeft;
    });
    await row(page).evaluate((el, at) => (el.scrollLeft = at), Math.round(loop / 2));
    const before = await scrollLeft(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(before + 200);
    const after = await scrollLeft(page);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect.poll(() => scrollLeft(page)).toBeLessThan(after - 200);
  });

  test("loops seamlessly: past the first copy it wraps back by one copy", async ({ page }) => {
    const loop = await row(page).evaluate((el) => {
      const track = el.firstElementChild as HTMLElement;
      const [a, b] = [track.children[0] as HTMLElement, track.children[1] as HTMLElement];
      return b.offsetLeft - a.offsetLeft;
    });
    expect(loop).toBeGreaterThan(0);
    await row(page).evaluate((el, at) => (el.scrollLeft = at), loop - 4);
    await expect.poll(() => scrollLeft(page), { timeout: 3000 }).toBeLessThan(loop / 2);
  });

  test("only the first copy is exposed to assistive tech and the Tab key", async ({ page }) => {
    await expect(row(page).getByRole("link", { name: /market cap/ })).toHaveCount(5);
    await expect(row(page).locator("[inert]")).toHaveCount(2);
  });
});

test.describe("Heating up carousel with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("stays still and shows each card once", async ({ page }) => {
    await openExplore(page);
    const start = await scrollLeft(page);
    await page.waitForTimeout(800);
    expect(await scrollLeft(page)).toBe(start);
    await expect(row(page).locator("a:visible")).toHaveCount(5);
  });
});
