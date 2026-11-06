import { expect, test } from "@playwright/test";
import { expectChain, expectSearch, expectShowing, openExplore, rowNames } from "./helpers";

test("the prompt's example URL restores the whole view, and survives a reload", async ({ page }) => {
  const search = "?chain=sol&pad=pons&tab=locked&tf=1h&q=mo";
  await openExplore(page, search);

  const check = async () => {
    await expectChain(page, "Solana");
    await expect(page.getByRole("button", { name: /^Pons/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tab", { name: "Locked Missions" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("group", { name: "Timeframe" }).getByRole("button", { name: "1h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("searchbox")).toHaveValue("mo");
    await expect(page.getByText("No tokens match these filters")).toBeVisible();
  };

  await check();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await check();
  await expectSearch(page, search);
});

test("a view built by clicking round-trips through the URL", async ({ page }) => {
  await openExplore(page);
  await page.getByRole("tab", { name: "Locked Missions" }).click();
  await page.getByRole("searchbox").fill("or");
  await expectShowing(page, 1);
  await expectSearch(page, "?tab=locked&q=or");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expectShowing(page, 1);
  expect(await rowNames(page)).toEqual(["Orbit"]);
  await expect(page.getByRole("searchbox")).toHaveValue("or");
});

test("the server streams a shared view, so it is right before the app hydrates", async ({ page }) => {
  // Block the app bundles: nothing hydrates, only React's inline streaming runs.
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.goto("/?chain=sol&tab=locked");
  await expect(page.getByText("Showing 1 of 8,412 tokens · refreshes every 4s")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tide" })).toBeVisible();
  await expectChain(page, "Solana");
});

test("unknown values fall back to the defaults", async ({ page }) => {
  await openExplore(page, "?chain=eth&tab=hot&tf=7d");
  await expectShowing(page, 10);
  await expect(page.getByRole("tab", { name: "Trending" })).toHaveAttribute("aria-selected", "true");
});
