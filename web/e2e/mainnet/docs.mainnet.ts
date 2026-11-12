import { expect, type Page, test } from "@playwright/test";

// This build is the site in mainnet mode with a made-up deployment (playwright.mainnet.config.ts). Its launchpad
// is the local stand-in, set as the real one is: 0.005 ETH to launch, 1 ETH and 1.073B tokens of virtual
// reserves. The live-data worker prices ETH at $3,000.

const EXPLORER = "https://robinhoodchain.blockscout.com/address";
const LAUNCHPAD = "0xbCaF0eCF36D15622a13D04b5ac58d312818BB4f0";
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const figure = (page: Page, name: string, key: string) => region(page, name).locator(`[data-figure="${key}"]`);

test("the docs read the launchpad live: its fee, reserves, cap, graduation point and state, in dollars at the live ETH price", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1, name: "How tonkfun.fun works." })).toBeVisible();

  await expect(figure(page, "Fees", "fee")).toHaveText("0.005 ETH≈ $15.00");
  await expect(figure(page, "The bonding curve", "reserves")).toHaveText("1 ETH and 1,073,000,000 tokens, virtual");
  await expect(figure(page, "The bonding curve", "startCap")).toHaveText("0.93 ETH≈ $2.8K");
  await expect(figure(page, "The bonding curve", "graduation")).toHaveText("After about 2.93 ETH net into the curveAt a market cap of about 14.4 ETH≈ $43.2K");
  await expect(figure(page, "Safety", "reserveNow")).toHaveText("1 ETH");
  await expect(figure(page, "Safety", "status")).toHaveText("Open");
  await expect(page.getByText("Read live from the launchpad on Robinhood Chain.").first()).toBeVisible();
  await expect(page.getByText("Demo figures, not read from a chain.")).toHaveCount(0);
  await expect(page.getByText("This is the testnet site", { exact: false })).toHaveCount(0);

  // The guarded launch: invite-only while the build lists invited wallets, and the beta notice.
  await expect(region(page, "Launching a token").getByText("Launch is invite-only for now: only invited creators can launch from this site.")).toBeVisible();
  await expect(region(page, "Safety").getByRole("note")).toContainText("Beta: there has been no outside audit.");
  const launchpad = region(page, "Safety").getByRole("link", { name: LAUNCHPAD });
  await expect(launchpad).toHaveAttribute("href", `${EXPLORER}/${LAUNCHPAD}?tab=contract`);

  // One tall screen rather than a full-page capture, so the sticky rail and contents run the whole height.
  await page.setViewportSize({ width: 1440, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.screenshot({ path: "e2e/screenshots/mainnet-docs-1440.png" });
});
