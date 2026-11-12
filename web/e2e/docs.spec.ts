import { expect, type Page, test } from "@playwright/test";
import { openExplore } from "./helpers";

// This build runs the demo (NEXT_PUBLIC_TONK_NETWORK=mock): the Docs page shows the demo's figures and says so.

const SECTIONS = ["What tonkfun.fun is", "Launching a token", "The bonding curve", "Fees", "Locks", "Crew Rewards", "The launch-block tax", "Mission score and badges", "Safety", "FAQ"];
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const figure = (page: Page, key: string) => page.locator(`[data-figure="${key}"]`).first();

async function openDocs(page: Page, path = "/docs"): Promise<void> {
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

test("the footer's Docs link opens the docs: every section in order, with the demo's figures marked as a demo", async ({ page }) => {
  await openExplore(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL("/docs");
  await expect(page).toHaveTitle("Docs — tonkfun.fun");
  await expect(page.getByRole("heading", { level: 1, name: "How tonkfun.fun works." })).toBeVisible();
  for (const name of SECTIONS) await expect(region(page, name)).toBeVisible();
  await expect(figure(page, "fee")).toHaveText("0.005 ETH");
  await expect(figure(page, "reserves")).toHaveText("1 ETH and 1,073,000,000 tokens, virtual");
  await expect(page.getByText("Demo figures, not read from a chain.").first()).toBeVisible();
  await expect(region(page, "Safety").getByRole("note")).toContainText("Beta: there has been no outside audit.");
});

test("a section's link can be shared: /docs#fees opens at Fees, and the contents beside it jump to any section", async ({ page }) => {
  await openDocs(page, "/docs#fees");
  const fees = region(page, "Fees");
  await expect(fees).toBeInViewport();
  const top = (await fees.boundingBox())?.y ?? -1;
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(80);

  // The table of contents stays in place beside the sections.
  const toc = page.getByRole("navigation", { name: "On this page" });
  await toc.getByRole("link", { name: "Safety" }).click();
  await expect(page).toHaveURL("/docs#safety");
  await expect(region(page, "Safety")).toBeInViewport();
  await expect(toc).toBeInViewport();
  await expect(toc.getByRole("link")).toHaveCount(SECTIONS.length);
});

test("keyboard: Enter on a contents link jumps to its section, and every Tab stop shows the focus ring", async ({ page }) => {
  await openDocs(page);
  const link = page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Locks" });
  await link.focus();
  expect(await focused(page)).toEqual({ label: "a:Locks", ring: true });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/docs#locks");
  await expect(region(page, "Locks")).toBeInViewport();

  await openDocs(page);
  const stops: Array<{ label: string; ring: boolean }> = [];
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press("Tab");
    const stop = await focused(page);
    if (!stop) break;
    if (stops.length && stop.label === stops[0].label) break; // wrapped around
    stops.push(stop);
  }
  expect(stops.filter((stop) => !stop.ring).map((stop) => stop.label)).toEqual([]);
  const labels = stops.map((stop) => stop.label);
  for (const expected of ["a:What tonkfun.fun is", "a:FAQ", "a:Docs", "a:Security"]) expect(labels).toContain(expected);
  // Labels keep their first 40 characters: the launchpad's address, and the link to the Security page.
  for (const start of ["a:0xbCaF0eCF36D15622a13D04b5ac58d312818", "a:What was checked"]) expect(labels.some((label) => label.startsWith(start))).toBe(true);
});

test.describe("at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [lang, theme, menu, fees] of [
    ["en", "dark", "On this page", "Fees"],
    ["de", "light", "Auf dieser Seite", "Gebühren"],
    ["de", "dark", "Auf dieser Seite", "Gebühren"],
    ["ru", "dark", "На этой странице", "Комиссии"],
    ["ru", "light", "На этой странице", "Комиссии"],
  ] as const) {
    test(`${lang}, ${theme}: nothing spills sideways, and the contents are a menu that jumps to a section`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      const path = lang === "en" ? "/docs" : `/${lang}/docs`;
      await openDocs(page, path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      expect(await spills(page)).toEqual([]);

      const nav = page.getByRole("navigation", { name: menu });
      await expect(nav).toBeHidden();
      await page.locator("summary", { hasText: menu }).click();
      await nav.getByRole("link", { name: fees }).click();
      await expect(page).toHaveURL(`${path}#fees`);
      await expect(nav).toBeHidden();
      // The section's heading lands below the sticky top bar, not under it.
      const bar = (await page.getByRole("banner").boundingBox()) ?? { y: 0, height: 0 };
      const heading = (await region(page, fees).getByRole("heading", { level: 2 }).boundingBox()) ?? { y: -1 };
      expect(heading.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      expect(heading.y).toBeLessThan(844);
    });
  }
});
