import { test } from "@playwright/test";
import { openExplore } from "./helpers";

// Reduced motion freezes the sweep at its start angle, the ticker at its first
// item and the countdown at 0:04, so the captures are stable run to run.
test.use({ reducedMotion: "reduce" });

test("full-page screenshot at 1440 px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExplore(page);
  await page.screenshot({ path: "e2e/screenshots/explore-1440.png", fullPage: true });
});

// The phone layout has a fixed bottom tab bar and a sticky top bar, which a
// full-page capture would freeze mid-page, so take three phone-sized screens.
test.describe("phone screens at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const SCREENS = [
    ["top", null],
    ["cards", "#hot-title"],
    ["list", '[aria-label="Token lists"]'],
  ] as const;

  for (const [name, anchor] of SCREENS) {
    test(`phone: ${name}`, async ({ page }) => {
      await openExplore(page);
      if (anchor) {
        await page.locator(anchor).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 70));
      }
      await page.waitForTimeout(200);
      await page.screenshot({ path: `e2e/screenshots/explore-390-${name}.png` });
    });
  }
});
