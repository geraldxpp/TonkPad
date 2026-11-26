import { expect, type Page, test } from "@playwright/test";
import { ANTHROPIC_RETENTION_URL, UPDATED } from "../src/modules/privacy/lib/bot";

// The Telegram bot's privacy policy, the public link set in @BotFather.

/** The policy's eight sections, in page order. */
const SECTIONS = ["What it reads", "AI answers and checks", "What it keeps", "What it never does", "Your choices and rights", "The official channel", "Telegram", "Questions"];

/** The two pages on other sites the policy links to, each opened in a new tab. */
const OUTSIDE = [
  ["AI answers and checks", "How long Anthropic keeps data", ANTHROPIC_RETENTION_URL],
  ["Telegram", "Telegram's privacy policy", "https://telegram.org/privacy"],
] as const;

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

test("the bot's privacy page says what it reads, what goes to the AI, what it keeps, what it never does and your rights", async ({ page }) => {
  await openPrivacy(page);
  await expect(page).toHaveTitle("Telegram bot privacy — tonkfun.fun");
  await expect(page.getByRole("heading", { level: 1, name: "The bot keeps very little, and not for long." })).toBeVisible();
  const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(UPDATED);
  await expect(page.getByText(`Last updated ${date}`)).toBeVisible();
  const article = page.getByRole("main").getByRole("article");
  await expect(article.getByRole("region")).toHaveCount(SECTIONS.length);
  await expect(article.getByRole("heading", { level: 2 })).toHaveText(SECTIONS);
  for (const name of SECTIONS) await expect(region(page, name)).toBeVisible();
  await expect(region(page, "What it reads").getByText(/^In tonkfun\.fun's official community group, where it is an admin/)).toBeVisible();
  await expect(region(page, "AI answers and checks").getByText(/^Anthropic deletes this text within 30 days\./)).toBeVisible();
  await expect(region(page, "What it keeps").getByText("In the official group only, it keeps these records on its server, then deletes them:")).toBeVisible();
  await expect(region(page, "Your choices and rights").getByText("The bot is run by the tonkfun.fun team for tonkfun.fun's community.")).toBeVisible();
  await region(page, "Questions").getByRole("link", { name: "Open the Security page" }).click();
  await expect(page).toHaveURL("/security");
  // No rail item lights up for this page.
  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]')).toHaveCount(0);
});

test("Anthropic's and Telegram's pages open in a new tab", async ({ page }) => {
  await openPrivacy(page);
  for (const [section, name, href] of OUTSIDE) {
    const link = region(page, section).getByRole("link", { name });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("in another language the page and its link keep the language", async ({ page }) => {
  await openPrivacy(page, "/es/privacy/telegram");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("The bot keeps very little, and not for long.");
  await expect(page.getByText("@TonkfunBot").first()).toBeVisible();
  await expect(page.getByRole("main").getByRole("article").getByRole("region")).toHaveCount(SECTIONS.length);
  await expect(page.locator(`main a[href="${ANTHROPIC_RETENTION_URL}"]`)).toHaveCount(1);
  await expect(page.locator('main a[href="/es/security"]')).toHaveCount(1);
});

test("keyboard: every Tab stop on the page shows the focus ring", async ({ page }) => {
  await openPrivacy(page);
  const stops: Array<{ label: string; ring: boolean }> = [];
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press("Tab");
    const stop = await focused(page);
    if (!stop) break;
    if (stops.length && stop.label === stops[0].label) break;
    stops.push(stop);
  }
  expect(stops.filter((stop) => !stop.ring).map((stop) => stop.label)).toEqual([]);
  const labels = stops.map((stop) => stop.label);
  for (const expected of ["a:How long Anthropic keeps data", "a:Telegram's privacy policy", "a:Open the Security page"]) expect(labels).toContain(expected);
});

test.describe("at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, theme] of [["en", "dark"], ["en", "light"], ["de", "light"], ["de", "dark"], ["ru", "dark"], ["ru", "light"]] as const) {
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
