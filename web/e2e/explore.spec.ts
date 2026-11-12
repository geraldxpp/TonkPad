import { expect, test } from "@playwright/test";
import { chainPill, expectChain, expectSearch, expectShowing, openExplore, rowNames, tokenRows } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openExplore(page);
});

test("shows the 10 default tokens", async ({ page }) => {
  await expectShowing(page, 10);
  await expect(page.getByRole("tab", { name: "Trending" })).toHaveAttribute("aria-selected", "true");
  await expectSearch(page, "");
});

test("list tabs filter the table and write ?tab=", async ({ page }) => {
  const tab = (name: string) => page.getByRole("tab", { name });

  await tab("Locked Missions").click();
  await expectShowing(page, 4);
  await expectSearch(page, "?tab=locked");

  await tab("Gainers").click();
  await expectShowing(page, 10);
  expect((await rowNames(page))[0]).toBe("Ghosty");
  await expect(tokenRows(page).first().getByRole("cell").first()).toHaveText("1");

  await tab("New pairs").click();
  await expectShowing(page, 4);
  await tab("Graduating").click();
  await expectShowing(page, 3);
  await tab("Graduated").click();
  await expectShowing(page, 3);
  await tab("Smart money").click();
  await expectShowing(page, 6);

  await tab("Trending").click();
  await expectShowing(page, 10);
  await expectSearch(page, "");
});

test("Locked Missions lists tonkfun.fun's launches, and a launch's page shows its holders", async ({ page }) => {
  await page.getByRole("tab", { name: "Locked Missions" }).click();
  await expectShowing(page, 4);
  await tokenRows(page).filter({ hasText: "Ghosty" }).getByRole("link", { name: "Ghosty" }).click();
  await expect(page).toHaveURL(/\/token\/GHOST$/);
  const activity = page.getByRole("region", { name: "Activity" });
  await activity.getByRole("tab", { name: "Holders · 1,204" }).click();
  const holders = activity.getByRole("table", { name: "Holders" });
  await expect(holders.getByText("Bonding curve")).toBeVisible();
  await expect(holders.getByRole("row")).toHaveCount(7);
});

test("ranks restart at 1 after filtering", async ({ page }) => {
  await page.getByRole("tab", { name: "Locked Missions" }).click();
  // Wait for the filtered list before reading it (evaluateAll doesn't retry).
  await expectShowing(page, 4);
  const ranks = await tokenRows(page).evaluateAll((rows) => rows.map((r) => r.firstElementChild?.textContent));
  expect(ranks).toEqual(["1", "2", "3", "4"]);
});

test("launchpad chips filter and write ?pad=", async ({ page }) => {
  const pons = page.getByRole("button", { name: /^Pons/ });
  await pons.click();
  await expect(pons).toHaveAttribute("aria-pressed", "true");
  await expectShowing(page, 2);
  expect(await rowNames(page)).toEqual(["Moonboi", "Mochi"]);
  await expectSearch(page, "?pad=pons");

  await page.getByRole("button", { name: /^All launchpads/ }).click();
  await expectShowing(page, 10);
  await expectSearch(page, "");
});

test('search filters by name or ticker ("mo" → 2) and writes ?q=', async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search tokens" }).fill("mo");
  await expectShowing(page, 2);
  expect(await rowNames(page)).toEqual(["Moonboi", "Mochi"]);
  await expectSearch(page, "?q=mo");
});

test("chain filter combines with launchpad; Reset filters clears everything", async ({ page }) => {
  await chainPill(page).click();
  await page.getByRole("option", { name: /^Solana/ }).click();
  await expectShowing(page, 5);
  await expectChain(page, "Solana");

  await page.getByRole("button", { name: /^Pons/ }).click();
  await expect(page.getByText("No tokens match these filters")).toBeVisible();
  await expectShowing(page, 0);
  await expectSearch(page, "?chain=sol&pad=pons");

  await page.getByRole("searchbox").fill("zz");
  await page.getByRole("tab", { name: "Locked Missions" }).click();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expectShowing(page, 10);
  await expectSearch(page, "");
  await expectChain(page, "All Chains");
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("tab", { name: "Trending" })).toBeFocused();
});

test("timeframe only switches the active pill", async ({ page }) => {
  const timeframe = page.getByRole("group", { name: "Timeframe" });
  await expect(timeframe.getByRole("button", { name: "24h" })).toHaveAttribute("aria-pressed", "true");
  await timeframe.getByRole("button", { name: "1h" }).click();
  await expect(timeframe.getByRole("button", { name: "1h" })).toHaveAttribute("aria-pressed", "true");
  await expectShowing(page, 10);
  await expectSearch(page, "?tf=1h");
});

test("the launch radar opens under the list and closes again", async ({ page }) => {
  const toggle = page.getByTestId("radar-toggle");
  const scope = page.getByRole("region", { name: "Live scope" });
  await expect(scope).toBeHidden();
  await toggle.click();
  await expect(scope).toBeVisible();
  await expect(page.locator('[data-blip-label="GHOST"]')).toBeVisible();
  await toggle.click();
  await expect(scope).toBeHidden();
});

test("pressing / focuses the search", async ({ page }) => {
  await expect(page.getByRole("searchbox")).not.toBeFocused();
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("searchbox")).toHaveValue(""); // the slash is not typed
});

test("each row ends with an arrow that opens the token", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Open GHOST" })).toHaveAttribute("href", "/token/GHOST");
  await expect(page.getByRole("link", { name: "Open SCAT" })).toHaveAttribute("href", "/token/SCAT");
});
