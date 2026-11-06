import { expect, test } from "@playwright/test";
import { chainPill, expectChain, expectSearch, expectShowing, openExplore } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openExplore(page);
});

test("opens with Enter, moves with the arrows and picks with Enter", async ({ page }) => {
  const pill = chainPill(page);
  await pill.focus();
  await page.keyboard.press("Enter");

  const listbox = page.getByRole("listbox", { name: "Chains" });
  await expect(listbox).toBeVisible();
  await expect(pill).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option", { name: /^All Chains/ })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: /^Solana/ })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(listbox).toBeHidden();
  await expect(pill).toBeFocused();
  await expectChain(page, "Solana");
  await expectShowing(page, 5);
  await expectSearch(page, "?chain=sol");
});

test("Escape closes without changing the chain and returns focus", async ({ page }) => {
  const pill = chainPill(page);
  await pill.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(pill).toBeFocused();
  await expectChain(page, "All Chains");
  await expectSearch(page, "");
});

test("ArrowDown on the pill opens the menu; End jumps to the last chain", async ({ page }) => {
  await chainPill(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: /^Robinhood Chain/ })).toBeFocused();
  await page.keyboard.press(" ");
  await expectChain(page, "Robinhood Chain");
  await expectShowing(page, 5);
});

test("a click outside closes the menu", async ({ page }) => {
  await chainPill(page).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("heading", { name: "Launches." }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("the focused option shows the focus ring", async ({ page }) => {
  await chainPill(page).focus();
  await page.keyboard.press("Enter");
  const outline = await page
    .getByRole("option", { name: /^All Chains/ })
    .evaluate((el) => getComputedStyle(el).outline);
  expect(outline).toContain("2px");
  expect(outline).toContain("rgb(74, 156, 245)");
});
