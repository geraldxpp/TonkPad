import { expect, type Locator, type Page } from "@playwright/test";

/** Opens Explore and waits until the app has hydrated. */
export async function openExplore(page: Page, search = ""): Promise<void> {
  await page.goto(`/${search}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

export function tokenTable(page: Page): Locator {
  return page.getByRole("table", { name: "Tokens" });
}

/** Body rows only (the first rowgroup holds the header). */
export function tokenRows(page: Page): Locator {
  return tokenTable(page).getByRole("rowgroup").nth(1).getByRole("row");
}

export async function expectShowing(page: Page, count: number): Promise<void> {
  await expect(page.getByText(`Showing ${count} of 8,412 tokens · refreshes every 4s`)).toBeVisible();
  await expect(tokenRows(page)).toHaveCount(count);
}

export async function rowNames(page: Page): Promise<string[]> {
  // Each row links its name and its open arrow; the arrow has no text.
  return (await tokenRows(page).locator('a[href^="/token/"]').allTextContents()).filter(Boolean);
}

export function chainPill(page: Page): Locator {
  return page.getByRole("button", { name: /^(All Chains|Solana|Robinhood Chain)$/ });
}

/** The pill's marks are aria-hidden letters, so check its accessible name rather than its text. */
export async function expectChain(page: Page, label: "All Chains" | "Solana" | "Robinhood Chain"): Promise<void> {
  await expect(chainPill(page)).toHaveAccessibleName(label);
}

/** The Heating up row glides on its own; hovering it pauses it so a card can be clicked. */
export async function pauseCarousel(page: Page): Promise<void> {
  await page.getByTestId("heating-cards").hover();
}

export async function expectSearch(page: Page, search: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe(search);
}
