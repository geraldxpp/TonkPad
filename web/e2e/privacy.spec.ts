import { expect, type Page, test } from "@playwright/test";

// The Telegram bot's privacy policy, the public link set in @BotFather.

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function openPrivacy(page: Page, path = "/privacy/telegram"): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

/** The focused element and whether it shows the 2 px --cta focus ring. */
async function focused(page: Page): Promise<{ label: string; ring: boolean } | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const target = el.matches("input[type=search]") ? (el.closest("label") as HTMLElement) : el;
    const s = getComputedStyle(target);
    const ring = s.outlineStyle === "solid" && s.outlineWidth === "2px" && s.outlineColor === "rgb(36, 219, 234)";
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? el.tagName;
    return { label: `${el.tagName.toLowerCase()}:${label}`, ring };
  });
}

/** Elements whose box runs past the viewport's right edge, or whose content runs past their own box. */
async function spills(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll("main *, footer *")]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().right > width + 0.5 || el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}: ${el.textContent?.trim().slice(0, 40)}`);
  });
}

test("the bot's privacy page says what it reads, that it keeps nothing, and what it never does", async ({ page }) => {
  await openPrivacy(page);
  await expect(page).toHaveTitle("Telegram bot privacy — tonkfun.fun");
  await expect(page.getByRole("heading", { level: 1, name: "The bot keeps nothing about you." })).toBeVisible();
  await expect(page.getByText("Last updated November 19, 2026")).toBeVisible();
  for (const name of ["What it reads", "What it keeps", "What it never does", "The official channel", "Telegram", "Questions"]) {
    await expect(region(page, name)).toBeVisible();
  }
  await expect(region(page, "Telegram").getByRole("link", { name: "Telegram's privacy policy" })).toHaveAttribute("href", "https://telegram.org/privacy");
  await region(page, "Questions").getByRole("link", { name: "Open the Security page" }).click();
  await expect(page).toHaveURL("/security");
  // No rail item lights up for this page.
  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]')).toHaveCount(0);
});

test("in another language the page and its link keep the language", async ({ page }) => {
  await openPrivacy(page, "/es/privacy/telegram");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("The bot keeps nothing about you.");
  await expect(page.getByText("@TonkfunBot").first()).toBeVisible();
  await expect(page.locator('main a[href="/es/security"]')).toHaveCount(1);
});

test("keyboard: every Tab stop on the page shows the focus ring", async ({ page }) => {
  await openPrivacy(page);
  const stops: Array<{ label: string; ring: boolean }> = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const stop = await focused(page);
    if (!stop) break;
    if (stops.length && stop.label === stops[0].label) break;
    stops.push(stop);
  }
  expect(stops.filter((stop) => !stop.ring).map((stop) => stop.label)).toEqual([]);
  const labels = stops.map((stop) => stop.label);
  for (const expected of ["a:Telegram's privacy policy", "a:Open the Security page"]) expect(labels).toContain(expected);
});

test.describe("at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, theme] of [["en", "dark"], ["en", "light"], ["de", "light"], ["ru", "dark"]] as const) {
    test(`${lang}, ${theme}: nothing spills sideways`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await openPrivacy(page, lang === "en" ? "/privacy/telegram" : `/${lang}/privacy/telegram`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      expect(await spills(page)).toEqual([]);
    });
  }
});

test.describe("screenshots", () => {
  test.use({ reducedMotion: "reduce" });

  for (const [width, lang, theme] of [[1440, "en", "dark"], [1440, "en", "light"], [390, "de", "light"], [390, "ru", "dark"]] as const) {
    test(`${width} px, ${lang}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await openPrivacy(page, lang === "en" ? "/privacy/telegram" : `/${lang}/privacy/telegram`);
      for (let i = 0; i < 3; i++) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width, height });
        if ((await page.evaluate(() => document.documentElement.scrollHeight)) === height) break;
      }
      await page.screenshot({ path: `e2e/screenshots/privacy-${width}-${lang}${theme === "light" ? "-light" : ""}.png` });
    });
  }
});
