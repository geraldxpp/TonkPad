import { expect, type Page, test } from "@playwright/test";

// This build is the testnet site: its launchpad is the local stand-in, at the fixture's test settings
// (0.0001 test ETH to launch, 0.0015 test ETH of virtual ETH). Its contracts are older test copies, and the page says so.

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("the testnet docs say whose figures they show, and count them in test ETH, never in dollars", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1, name: "How tonkfun.fun works." })).toBeVisible();
  await expect(page.getByText(/^This is the testnet site\./)).toBeVisible();
  await expect(region(page, "Fees").locator('[data-figure="fee"]')).toHaveText("0.0001 test ETH");
  await expect(region(page, "Safety").locator('[data-figure="reserveNow"]')).toHaveText("0.0015 test ETH");
  await expect(page.getByText("Read live from the launchpad on Robinhood Chain Testnet.").first()).toBeVisible();
  await expect(page.locator("main").getByText(/\$\d/)).toHaveCount(0);
});
