import { expect, type Page, test } from "@playwright/test";
import { STUB_ACCOUNTS, STUB_REJECT_KEY } from "../src/shared/wallet/stub-driver";
import { expectTokenImage, serveTokenImages, uploadPicture } from "./helpers";
import { E2E_IMAGE_HOST } from "./testnet/fixtures";

// The Creator Studio's token image: the stub wallet really signs (with its test key), and the server
// route really checks, re-encodes and stores it, in the e2e build's memory. Nothing goes anywhere real.

const SETTINGS = { chainId: 0, launchFee: "5000000000000000", virtualEth: "6000000000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: "20000000", readAt: 1 };
const TOKEN = "0x1111111111111111111111111111111111111111";
const IMAGE = new RegExp(`^https://${E2E_IMAGE_HOST.replaceAll(".", "\\.")}/token-art/[0-9a-f]{64}\\.webp$`);
const MISSION = { token: TOKEN, creator: STUB_ACCOUNTS.rh, name: "Astro Pup", symbol: "ASTRO", crewBps: 200, creatorBps: 100, lockType: "linear", lockedBps: 8000, lockEnd: 1_800_000_000, devBuy: "250000000000000000", bought: "1", locked: "1", protocolFee: "1", creatorFee: "1", block: 1 };

/** The wallet's balance, the launch build and its receipt, answered here; the launch requests are kept. */
async function stubLaunch(page: Page): Promise<Record<string, unknown>[]> {
  const builds: Record<string, unknown>[] = [];
  await page.route("**/api/wallet/rh/**", (route) => route.fulfill({ json: { chain: "rh", owner: STUB_ACCOUNTS.rh, native: { raw: "2000000000000000000", decimals: 18 }, token: null, readAt: Date.now() } }));
  await page.route("**/api/tonk/launch", (route) => {
    builds.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ json: { tx: { to: TOKEN, data: "0x", value: "255000000000000000", gas: "2000000" }, settings: SETTINGS, bought: "1", locked: "1" } });
  });
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: MISSION } }));
  return builds;
}

async function choose(page: Page, button: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(file);
}

test("an image is signed for, uploaded, shown square in the preview and the review, and launched with", async ({ page }) => {
  const builds = await stubLaunch(page);
  const served = await serveTokenImages(page);
  await page.goto("/launch");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Token name").fill("Astro Pup");
  await page.getByLabel("Ticker", { exact: true }).fill("astro");
  await expect(page.getByText("Connect your wallet to add an image.")).toBeVisible();
  await page.getByRole("region", { name: "Your launch, at a glance." }).getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByText("PNG, JPEG, WebP or GIF, up to 2 MB. Cropped to a square; an animated GIF keeps its first frame.")).toBeVisible();

  // The file is checked before anything is signed; a refusal in the wallet uploads nothing.
  await choose(page, "Choose image", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") });
  await expect(page.getByText("Choose a PNG, JPEG, WebP or GIF image.")).toBeVisible();
  await page.evaluate((key) => localStorage.setItem(key, "1"), STUB_REJECT_KEY);
  await choose(page, "Choose image", await uploadPicture());
  await expect(page.getByText("Rejected in your wallet. Nothing was uploaded.")).toBeVisible();
  await page.evaluate((key) => localStorage.removeItem(key), STUB_REJECT_KEY);

  await choose(page, "Choose image", await uploadPicture());
  await expect(page.getByText("Image uploaded.")).toBeVisible();
  const preview = page.getByRole("region", { name: "Token preview" });
  await expectTokenImage(preview, E2E_IMAGE_HOST);
  expect(served.every((address) => IMAGE.test(address))).toBe(true);

  // Removed, it shows the letter again; chosen again, it comes back at the same address.
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByText("Image removed.")).toBeVisible();
  await expect(preview.locator(`img[src*="${E2E_IMAGE_HOST}"]`)).toHaveCount(0);
  await choose(page, "Choose image", await uploadPicture());
  await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
  await expectTokenImage(preview, E2E_IMAGE_HOST);

  await page.getByRole("region", { name: "Your launch, at a glance." }).getByRole("button", { name: "Review launch" }).click();
  const review = page.getByRole("dialog", { name: "One final look." });
  await expectTokenImage(review, E2E_IMAGE_HOST);
  await review.getByLabel("I have checked these settings.").check();
  await review.getByRole("button", { name: "Launch $ASTRO" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mission launched" })).toBeVisible();
  expect(builds).toHaveLength(1);
  expect(builds[0].image).toMatch(IMAGE);
  expect(new Set(served).size).toBe(1);
});

test("the upload route itself refuses a file without a valid signature", async ({ request }) => {
  const res = await request.post("/api/tonk/image", {
    multipart: { file: { name: "pup.png", mimeType: "image/png", buffer: (await uploadPicture()).buffer }, wallet: STUB_ACCOUNTS.rh, time: new Date().toISOString(), signature: `0x${"12".repeat(65)}`, lang: "en" },
  });
  expect([res.status(), await res.json()]).toEqual([401, { error: "signature" }]);
});
