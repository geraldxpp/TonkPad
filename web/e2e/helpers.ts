import { expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { E2E_IMAGE_HOST } from "./testnet/fixtures";

/**
 * Answers the image optimiser in the browser for every token image on the e2e image host (which
 * never resolves), with a small green square. Resolves with the image addresses the page asked for.
 */
export async function serveTokenImages(page: Page): Promise<string[]> {
  const asked: string[] = [];
  const body = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 61, g: 220, b: 132 } } }).png().toBuffer();
  await page.route("**/_next/image?**", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url") ?? "";
    if (!source.startsWith(`https://${E2E_IMAGE_HOST}/token-art/`)) return route.continue();
    asked.push(source);
    return route.fulfill({ body, contentType: "image/png" });
  });
  return asked;
}

/** A token image that has loaded: an <img> through the optimiser from the e2e image host, decoded. */
export async function expectTokenImage(scope: Locator, address: string): Promise<void> {
  const image = scope.locator(`img[src*="${encodeURIComponent(address)}"]`).first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
}

/** A picture to upload, made on the spot: a 640 × 480 PNG. */
export const uploadPicture = async () => ({
  name: "pup.png",
  mimeType: "image/png",
  buffer: await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 230, g: 120, b: 40 } } }).png().toBuffer(),
});

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
