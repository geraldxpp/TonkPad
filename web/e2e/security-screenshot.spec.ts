import { type Page, test } from "@playwright/test";

// Reduced motion keeps the status bar and the ticker still.
test.use({ reducedMotion: "reduce" });

async function open(page: Page, path: string, theme: "dark" | "light") {
  if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The whole page as one tall screen. A full-page capture would freeze the phone's fixed tab bar
 * mid-page and cut the sticky rail at the first screen, so the viewport grows to the page's height
 * instead, and both sit where they would on a screen that tall.
 */
async function captureWhole(page: Page, path: string) {
  const width = page.viewportSize()?.width ?? 1440;
  for (let i = 0; i < 3; i++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height });
    if ((await page.evaluate(() => document.documentElement.scrollHeight)) === height) break;
  }
  await page.screenshot({ path });
}

for (const theme of ["dark", "light"] as const) {
  test(`security page at 1440 px, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/security", theme);
    await captureWhole(page, `e2e/screenshots/security-1440${theme === "light" ? "-light" : ""}.png`);
  });
}

test.describe("phone at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  for (const [lang, theme] of [["en", "dark"], ["de", "light"], ["ru", "dark"]] as const) {
    test(`${lang}, ${theme}`, async ({ page }) => {
      await open(page, lang === "en" ? "/security" : `/${lang}/security`, theme);
      await captureWhole(page, `e2e/screenshots/security-390-${lang}${theme === "light" ? "-light" : ""}.png`);
    });
  }
});
