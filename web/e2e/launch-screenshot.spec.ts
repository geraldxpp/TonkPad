import { type Page, test } from "@playwright/test";

// Reduced motion keeps the status bar and the ticker still.
test.use({ reducedMotion: "reduce" });

/** The design's example launch (Astro Pup), so the capture can sit beside the design's own. */
async function fillExample(page: Page) {
  await page.getByLabel("Token name").fill("Astro Pup");
  await page.getByLabel("Ticker", { exact: true }).fill("ASTRO");
  await page.getByLabel("Description").fill("A good boy on a long mission. Built on Robinhood Chain, with locked dev supply and ETH rewards for the crew.");
  await page.getByLabel("X handle").fill("@astropup");
  await page.getByLabel("Telegram").fill("t.me/astropup");
  await page.getByLabel("Website").fill("astropup.fun");
}

async function open(page: Page, path = "/launch") {
  await page.route("**/api/wallet/rh/**", (route) => route.fulfill({ status: 502, json: { error: "balances unavailable" } }));
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of ["dark", "light"] as const) {
  test(`launch screen at 1440 px, ${theme}`, async ({ page }) => {
    if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
    // The design was captured 1100 px tall, where the whole right column fits.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await open(page);
    await fillExample(page);
    await page.getByRole("switch", { name: "Enabled" }).check();
    await page.getByLabel("Agent name").fill("Commander Astro");
    await page.getByLabel("Role", { exact: true }).fill("Mission commander");
    await page.getByLabel("Personality & mission brief").fill("Keep holders calm and informed. Use facts from the chain, keep answers short, and never promise a price.");
    await page.getByLabel("Personality & mission brief").blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `e2e/screenshots/launch-1440${theme === "light" ? "-light" : ""}.png`, fullPage: true });
    if (theme === "light") return;
    // On a laptop the right column scrolls by itself: what you pay and the button stay in view.
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.screenshot({ path: "e2e/screenshots/launch-1440-laptop.png" });
  });
}

// The phone flow has a fixed bar, so take phone-sized screens of each step rather than one long capture.
test.describe("phone screens at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  for (const [lang, theme] of [["en", "dark"], ["de", "dark"], ["ru", "light"]] as const) {
    test(`${lang}, ${theme}: the four steps and the review`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      const base = lang === "en" ? "" : `/${lang}`;
      for (const step of [1, 2, 3, 4]) {
        await open(page, `${base}/launch?step=${step}`);
        await page.screenshot({ path: `e2e/screenshots/launch-390-step${step}-${lang}${theme === "light" ? "-light" : ""}.png` });
      }
    });
  }
});
