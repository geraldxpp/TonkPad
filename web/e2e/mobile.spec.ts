import { expect, test } from "@playwright/test";
import { expectChain, expectSearch, expectShowing, openExplore, rowNames } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await openExplore(page);
});

test("the magnifier opens the search row, which filters the list", async ({ page }) => {
  const toggle = page.getByRole("banner").getByRole("button", { name: "Search" });
  await toggle.tap();
  const field = page.getByRole("searchbox", { name: "Search tokens" });
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await field.fill("mo");
  await expectShowing(page, 2);
  expect(await rowNames(page)).toEqual(["Moonboi", "Mochi"]);
  await expectSearch(page, "?q=mo");

  // Folding the row away keeps the query (and the list filtered).
  await toggle.tap();
  await expect(field).toBeHidden();
  await expectShowing(page, 2);
});

test("a shared link with a query opens the search row", async ({ page }) => {
  await openExplore(page, "?q=or");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("or");
  await expectShowing(page, 1);
});

test("the chain filter sits in the list toolbar and filters by chain", async ({ page }) => {
  await expect(page.getByRole("banner").getByRole("button", { name: "All Chains" })).toBeHidden();
  const pill = page.getByRole("region", { name: "All tokens" }).getByRole("button", { name: "All Chains" });
  await pill.tap();
  await page.getByRole("option", { name: /^Solana/ }).tap();
  await expectChain(page, "Solana");
  await expectShowing(page, 5);
  await expectSearch(page, "?chain=sol");
});

test("the tab row and launchpad chips scroll sideways and still work", async ({ page }) => {
  await page.getByRole("tab", { name: "Locked Missions" }).tap();
  await expectShowing(page, 4);
  await page.getByRole("tab", { name: "Trending" }).tap();
  await page.getByRole("button", { name: /^Bags/ }).tap();
  await expectShowing(page, 1);
  expect(await rowNames(page)).toEqual(["Shroomy"]);
});

test("the bottom tab bar navigates", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Live" }).tap();
  await expect(page).toHaveURL("/live");
  await expect(page.getByRole("heading", { level: 1, name: "Live" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Live" })).toHaveAttribute("aria-current", "page");
});

test("compact rows link to the token page", async ({ page }) => {
  await page.getByRole("table", { name: "Tokens" }).getByRole("link", { name: "Orbit" }).tap();
  await expect(page).toHaveURL("/token/ORB");
});
