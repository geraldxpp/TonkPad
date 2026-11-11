import { expect, type Page, test } from "@playwright/test";
import { openExplore } from "./helpers";

// This build sets no security contact, no bounty amounts and no mainnet deployment (playwright.config.ts).

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function openSecurity(page: Page, path = "/security"): Promise<void> {
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

/** Elements on the page whose box runs past the viewport's right edge, or whose content runs past their own box. */
async function spills(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll("main *, footer *")]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().right > width + 0.5 || el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}: ${el.textContent?.trim().slice(0, 40)}`);
  });
}

test("the footer's Security link opens the security page", async ({ page }) => {
  await openExplore(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "Security" }).click();
  await expect(page).toHaveURL("/security");
  await expect(page).toHaveTitle("Security — tonkfun.fun");
  await expect(page.getByRole("heading", { level: 1, name: "Found a flaw? Tell us first." })).toBeVisible();
  for (const name of ["Report a vulnerability", "Scope", "Rules", "Rewards", "What was checked"]) {
    await expect(region(page, name)).toBeVisible();
  }
  // No rail item lights up for a footer page.
  await expect(page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]')).toHaveCount(0);
});

test("before the owner sets anything: contact coming soon, nothing deployed, no amounts made up, and no outside audit said plainly", async ({ page }) => {
  await openSecurity(page);
  await expect(region(page, "Report a vulnerability").getByText("Coming soon", { exact: true })).toBeVisible();
  await expect(region(page, "Report a vulnerability").getByRole("link")).toHaveCount(0);
  const scope = region(page, "Scope");
  await expect(scope.getByText("Not deployed yet")).toHaveCount(3);
  await expect(scope.getByText("648269c32cbf8de79c3391067c37c1575d7ed61283b705d766608ff055c1591d")).toBeVisible();
  await expect(scope.getByText("0b2aacd09d931de57801507654e24538f2fb34c67803e6b19eff0662fc0bb1ac")).toBeVisible();
  await expect(scope.getByText("954c1567df49c8fdc18b853944b8bf6f27b279559caa5fcdc4af8d0a43bc0f0f")).toBeVisible();
  await expect(region(page, "Rewards").getByText("Decided case by case")).toHaveCount(4);
  await expect(region(page, "Rewards").getByText(/^Up to /)).toHaveCount(0);
  await expect(region(page, "What was checked").getByRole("note")).toContainText("There was no outside audit.");
});

test("keyboard: the footer link opens the page with Enter, and every Tab stop shows the focus ring", async ({ page }) => {
  await openExplore(page);
  const link = page.getByRole("contentinfo").getByRole("link", { name: "Security" });
  await link.focus();
  expect(await focused(page)).toEqual({ label: "a:Security", ring: true });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/security");
  await expect(page.getByRole("heading", { level: 1, name: "Found a flaw? Tell us first." })).toBeVisible();

  // The footer stays put across pages, so focus is still on its last link: tab through a fresh load from the top.
  await openSecurity(page);
  const stops: Array<{ label: string; ring: boolean }> = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const stop = await focused(page);
    if (!stop) break;
    if (stops.length && stop.label === stops[0].label) break; // wrapped around
    stops.push(stop);
  }
  expect(stops.filter((stop) => !stop.ring).map((stop) => stop.label)).toEqual([]);
  const labels = stops.map((stop) => stop.label);
  for (const expected of ["a:Explore", "a:Docs", "a:Terms", "a:Security"]) expect(labels).toContain(expected);
});

test("in another language the page and its footer link keep the language", async ({ page }) => {
  await openSecurity(page, "/de/security");
  await expect(page.getByRole("heading", { level: 1, name: "Eine Lücke gefunden? Sag es uns zuerst." })).toBeVisible();
  await expect(page).toHaveTitle("Sicherheit — tonkfun.fun");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Sicherheit" })).toHaveAttribute("href", "/de/security");
  await expect(region(page, "Umfang").getByText("Noch nicht deployt")).toHaveCount(3);
});

test.describe("at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, theme, footer] of [
    ["en", "dark", "Security"],
    ["en", "light", "Security"],
    ["de", "light", "Sicherheit"],
    ["ru", "dark", "Безопасность"],
  ] as const) {
    test(`${lang}, ${theme}: nothing spills sideways`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      const path = lang === "en" ? "/security" : `/${lang}/security`;
      await openSecurity(page, path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      expect(await spills(page)).toEqual([]);
      await expect(page.getByRole("contentinfo").getByRole("link", { name: footer })).toHaveAttribute("href", path);
    });
  }
});
