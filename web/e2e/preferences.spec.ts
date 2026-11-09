import { expect, type Page, test } from "@playwright/test";
import { openExplore } from "./helpers";

const DARK_BG = "rgb(7, 8, 10)";
const LIGHT_BG = "rgb(243, 245, 248)";

async function pageTheme(page: Page) {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
}

function saveLightTheme(page: Page) {
  return page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
}

test.describe("theme", () => {
  test("dark by default; the header switch turns on light, which survives a reload", async ({ page }) => {
    await openExplore(page);
    expect(await pageTheme(page)).toEqual({ theme: "dark", bg: DARK_BG });

    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Switch to light theme" }).click();
    expect(await pageTheme(page)).toEqual({ theme: "light", bg: LIGHT_BG });
    await expect(header.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#F3F5F8");

    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await pageTheme(page)).toEqual({ theme: "light", bg: LIGHT_BG });

    await header.getByRole("button", { name: "Switch to dark theme" }).click();
    expect(await pageTheme(page)).toEqual({ theme: "dark", bg: DARK_BG });
  });

  test("a saved light theme is on before the app loads, so it never flashes dark", async ({ page }) => {
    await saveLightTheme(page);
    // No app scripts at all: only the inline <head> script can set the theme.
    await page.route("**/_next/static/chunks/**", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/");
    expect(await pageTheme(page)).toEqual({ theme: "light", bg: LIGHT_BG });
  });

  test("the token cards stay dark art tiles in the light theme", async ({ page }) => {
    await saveLightTheme(page);
    await openExplore(page);
    const card = page.getByTestId("heating-cards").getByRole("link", { name: /^Ghosty, market cap/ }).first();
    await expect(card).toHaveAttribute("data-theme", "dark");
    // The card keeps the dark palette's bright green; the light table uses the deeper one.
    await expect(card.getByText("Locked", { exact: true })).toHaveCSS("color", "rgb(61, 220, 132)");
    const tableLocked = page.getByRole("table", { name: "Tokens" }).getByText("Locked", { exact: true }).first();
    await expect(tableLocked).toHaveCSS("color", "rgb(8, 112, 58)");
  });

  test("the rail's Theme item flips the theme as well", async ({ page }) => {
    await openExplore(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("button", { name: "Switch to light theme" }).click();
    expect((await pageTheme(page)).theme).toBe("light");
    await nav.getByRole("button", { name: "Switch to dark theme" }).click();
    expect((await pageTheme(page)).theme).toBe("dark");
  });
});

test.describe("language", () => {
  test("English is the default, at the unprefixed URLs", async ({ page }) => {
    await openExplore(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Launches.");
    await expect(page.getByRole("button", { name: "Language: English" })).toHaveText("EN", { useInnerText: true });
  });

  test("the menu switches language, keeps the view and remembers the choice", async ({ page }) => {
    await openExplore(page, "?tab=locked");
    await page.getByRole("button", { name: "Language: English" }).click();
    await expect(page.getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("link", { name: "Español" }).click();

    await expect(page).toHaveURL((url) => url.pathname === "/es" && url.search === "?tab=locked");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveTitle("Explorar — Tonkpad.fun");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lanzamientos.");
    await expect(page.getByRole("tab", { name: "Misiones bloqueadas" })).toHaveAttribute("aria-selected", "true");

    // An unprefixed URL now lands on the remembered language.
    await page.goto("/live");
    await expect(page).toHaveURL((url) => url.pathname === "/es/live");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("En vivo");

    // Picking English goes back to the unprefixed URLs, and stays there.
    await page.getByRole("button", { name: "Idioma: Español" }).click();
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/live");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Live");
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the language menu works from the keyboard", async ({ page }) => {
    await openExplore(page);
    const trigger = page.getByRole("button", { name: "Language: English" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "English" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("link", { name: "Español" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("link", { name: "Bahasa Indonesia" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  for (const [path, lang, heading] of [
    ["/ja", "ja", "新規ローンチ."],
    ["/ru", "ru", "Запуски."],
    ["/zh", "zh-CN", "新币发射."],
    ["/de/live", "de", "Live"],
    ["/fr/token/ghost", "fr", "Ghosty"],
  ] as const) {
    test(`${path} is served in its language`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    });
  }

  test("unknown pages are a translated 404 inside the app", async ({ page }) => {
    expect((await page.goto("/no-such-page"))?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    expect((await page.goto("/es/no-such-page"))?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver a Explorar" })).toHaveAttribute("href", "/es");
  });
});

test.describe("phone top bar", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the theme button is right in the top bar", async ({ page }) => {
    await openExplore(page);
    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Switch to light theme" }).tap();
    expect(await pageTheme(page)).toEqual({ theme: "light", bg: LIGHT_BG });
    await header.getByRole("button", { name: "Switch to dark theme" }).tap();
    expect(await pageTheme(page)).toEqual({ theme: "dark", bg: DARK_BG });
  });

  test("the language button opens a full-width menu under the top bar", async ({ page }) => {
    await openExplore(page);
    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Language: English" }).tap();
    const english = page.getByRole("link", { name: "English" });
    await expect(english).toHaveAttribute("aria-current", "true");
    // The menu sits on screen, just below the bar, with every language.
    const menuId = await header.getByRole("button", { name: "Language: English" }).getAttribute("aria-controls");
    const menu = page.locator(`[id="${menuId}"]`);
    const box = (await menu.boundingBox())!;
    const bar = (await header.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    await expect(menu.getByRole("link")).toHaveCount(12);

    await page.getByRole("link", { name: "日本語" }).tap();
    await expect(page).toHaveURL((url) => url.pathname === "/ja");
    await expect(page.getByRole("banner").getByRole("button", { name: "言語：日本語" })).toBeVisible();
  });
});

test.describe("phone settings sheet", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("More opens a sheet with the theme switch and every language", async ({ page }) => {
    await openExplore(page);
    const more = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" });
    await more.tap();
    const sheet = page.getByRole("dialog", { name: "Settings" });
    await expect(sheet).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const box = await sheet.boundingBox();
    expect(box!.width).toBe(390);
    expect(Math.round(box!.y + box!.height)).toBe(844);
    await expect(sheet.getByRole("link")).toHaveCount(12);

    await sheet.getByRole("button", { name: "Light" }).tap();
    expect((await pageTheme(page)).theme).toBe("light");
    await expect(sheet.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");

    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();
    await expect(more).toHaveAttribute("aria-expanded", "false");

    await more.tap();
    await page.getByRole("dialog", { name: "Settings" }).getByRole("link", { name: "Deutsch" }).tap();
    await expect(page).toHaveURL((url) => url.pathname === "/de");
    const nav = page.getByRole("navigation", { name: "Hauptmenü" });
    await expect(nav.getByRole("link", { name: "Entdecken" })).toHaveAttribute("aria-current", "page");
    expect((await pageTheme(page)).theme).toBe("light");
  });
});

test.describe("long languages on a 360 px phone", () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test("English still says Connect wallet in full, with every top-bar button", async ({ page }) => {
    await openExplore(page);
    const header = page.getByRole("banner");
    expect((await header.boundingBox())!.height).toBeLessThan(70);
    await expect(header.getByRole("button", { name: "Connect wallet" })).toHaveText("Connect wallet", { useInnerText: true });
    for (const name of ["Search", "Language: English", "Switch to light theme", "Alerts"]) {
      await expect(header.getByRole("button", { name })).toBeVisible();
    }
  });

  for (const lang of ["de", "fr", "ru", "vi", "id"]) {
    test(`${lang}: one-row top bar, whole tab labels, no sideways scroll`, async ({ page }) => {
      await page.goto(`/${lang}`);
      await page.waitForLoadState("networkidle");
      expect((await page.getByRole("banner").boundingBox())!.height).toBeLessThan(70);
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll("nav a > span, nav button > span")]
          .filter((s) => s.getClientRects().length > 0 && s.scrollWidth > s.clientWidth)
          .map((s) => s.textContent),
      );
      expect(cut).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    });
  }
});

test.describe("long languages on desktop", () => {
  for (const [lang, width] of [
    ["de", 1440],
    ["ru", 1440],
    ["fr", 1440],
    ["de", 1024],
  ] as const) {
    test(`${lang} at ${width} px: one-row top bar, table rows on one line, nothing spills`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${lang}`);
      await page.waitForLoadState("networkidle");
      if (width >= 1280) expect((await page.getByRole("banner").boundingBox())!.height).toBeLessThan(70);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

      const table = page.locator('[role="table"][data-variant="table"]');
      // Headers may wrap onto two short lines but never run past their column.
      const spilled = await table
        .getByRole("columnheader")
        .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent));
      expect(spilled).toEqual([]);
      // Every body row keeps its cells on one line.
      const lines = await table
        .getByRole("rowgroup")
        .nth(1)
        .getByRole("row")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const cells = [...row.children].filter((c) => (c as HTMLElement).offsetParent !== null);
            return new Set(cells.map((c) => { const b = c.getBoundingClientRect(); return Math.round((b.top + b.height / 2) / 6); })).size;
          }),
        );
      expect(lines.every((n) => n === 1)).toBe(true);
    });
  }
});

test.describe("phone top bar on any device", () => {
  async function expectOneRow(page: Page) {
    const header = page.getByRole("banner");
    // One row of 32 px controls; the old wrap made the bar about 100 px tall.
    expect((await header.boundingBox())!.height).toBeLessThan(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    return header;
  }

  for (const width of [320, 344, 384, 412]) {
    test(`${width} px: every control on one row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openExplore(page);
      const header = await expectOneRow(page);
      for (const name of ["Search", "Language: English", "Switch to light theme", "Alerts", "Connect wallet"]) {
        await expect(header.getByRole("button", { name })).toBeVisible();
      }
      // From 340 px the label is in full; below that the wallet icon carries it.
      const label = width >= 340 ? "Connect wallet" : "";
      await expect(header.getByRole("button", { name: "Connect wallet" })).toHaveText(label, { useInnerText: true });
    });
  }

  test("a big system font never pushes Connect wallet onto a second row", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openExplore(page);
    // Android's font-size setting scales text but not the buttons around it.
    await page.addStyleTag({ content: 'header button[aria-label="Connect wallet"] span { font-size: 20px !important; }' });
    await expectOneRow(page);
  });
});
