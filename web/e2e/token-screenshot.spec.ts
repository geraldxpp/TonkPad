import { test } from "@playwright/test";
import { de } from "../src/shared/i18n/dictionaries/de";
import { ru } from "../src/shared/i18n/dictionaries/ru";

// Reduced motion keeps the status bar still; UTC puts the chart's axis on the export's hours.
test.use({ reducedMotion: "reduce", timezoneId: "UTC" });

async function open(page: import("@playwright/test").Page, path = "/token/GHOST"): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("canvas").first().waitFor();
  await page.waitForTimeout(300);
}

test("token screen at 1440 px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.screenshot({ path: "e2e/screenshots/token-1440.png", fullPage: true });
});

test("token screen at 1440 px, light", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.screenshot({ path: "e2e/screenshots/token-1440-light.png", fullPage: true });
});

// The phone layout has a fixed Buy / Sell bar, so take phone-sized screens rather than one long capture.
test.describe("phone screens at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  for (const [lang, theme, dictionary] of [["de", "dark", de], ["ru", "light", ru]] as const) {
    const screens = [
      ["top", null],
      ["chart", dictionary.token.chart.label],
      ["insights", dictionary.token.insights.title],
      ["trade", null],
      ["agent", null],
    ] as const;
    for (const [name, region] of screens) {
      test(`phone: ${name} (${lang}, ${theme})`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem("tonkpad-theme", value), theme);
        await open(page, `/${lang}/token/GHOST`);
        if (region) {
          await page.getByRole("region", { name: region, exact: true })
            .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 110));
        }
        // The trade form opens from the bottom bar's Buy; the agent from its card.
        if (name === "trade") await page.getByRole("button", { name: dictionary.token.trade.buy, exact: true }).tap();
        if (name === "agent") await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "Captain Boo" }).tap();
        await page.waitForTimeout(200);
        await page.screenshot({ path: `e2e/screenshots/token-390-${name}-${lang}${theme === "light" ? "-light" : ""}.png` });
      });
    }
  }
});
