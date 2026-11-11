import { expect, type Page, test } from "@playwright/test";
import { MAINNET_DEPLOYMENT } from "../testnet/fixtures";

// This build is the site in mainnet mode with a made-up deployment and a made-up security contact
// (playwright.mainnet.config.ts). The bounty amounts stay unset.

const EXPLORER = "https://robinhoodchain.blockscout.com";
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("the security page names the deployment's launchpad and migrator, the guard through the migrator, and the contact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/security");
  await expect(page.getByRole("heading", { level: 1, name: "Found a flaw? Tell us first." })).toBeVisible();

  const scope = region(page, "Scope");
  for (const address of [MAINNET_DEPLOYMENT.launchpad, MAINNET_DEPLOYMENT.migrator]) {
    const link = scope.getByRole("link", { name: address });
    await expect(link).toHaveAttribute("href", `${EXPLORER}/address/${address}`);
    await expect(link).toHaveAttribute("target", "_blank");
  }
  // The guard's address is not a setting: the page sends you to the migrator's initializationGuard().
  await expect(scope.getByText("initializationGuard()")).toBeVisible();
  await expect(scope.getByText(MAINNET_DEPLOYMENT.guard)).toHaveCount(0);
  await expect(scope.getByText("Not deployed yet")).toHaveCount(0);

  const contact = region(page, "Report a vulnerability").getByRole("link", { name: "security@example.com" });
  await expect(contact).toHaveAttribute("href", "mailto:security@example.com");
  await expect(region(page, "Rewards").getByText("Decided case by case")).toHaveCount(4);

  // Each link on the page is a Tab stop with the focus ring.
  for (const link of [contact, scope.getByRole("link", { name: MAINNET_DEPLOYMENT.launchpad }), scope.getByRole("link", { name: MAINNET_DEPLOYMENT.migrator })]) {
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    await expect(link).toHaveCSS("outline-width", "2px");
  }
  await page.locator(":focus").blur();
  // One tall screen rather than a full-page capture, so the sticky rail runs the whole height.
  await page.setViewportSize({ width: 1440, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.screenshot({ path: "e2e/screenshots/mainnet-security-1440.png" });
});
