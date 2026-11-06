import { test } from "@playwright/test";
import { openExplore } from "./helpers";

// Reduced motion freezes the sweep at its start angle, the ticker at its first
// item and the countdown at 0:04, so the capture is stable run to run.
test.use({ reducedMotion: "reduce" });

test("full-page screenshot at 1440 px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExplore(page);
  await page.screenshot({ path: "e2e/screenshots/explore-1440.png", fullPage: true });
});

test("full-page screenshot at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExplore(page);
  await page.screenshot({ path: "e2e/screenshots/explore-390.png", fullPage: true });
});
