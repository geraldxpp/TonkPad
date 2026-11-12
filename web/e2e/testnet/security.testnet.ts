import { expect, test } from "@playwright/test";

// This build is the testnet site. Its deployment values name testnet contracts, so the security page,
// whose scope is the mainnet build, never shows them as mainnet's.

test("the footer links to the security page, which leaves the mainnet addresses to the mainnet site", async ({ page }) => {
  await page.goto("/launch");
  await page.getByRole("contentinfo").getByRole("link", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByRole("heading", { level: 1, name: "Found a flaw? Tell us first." })).toBeVisible();
  const scope = page.getByRole("region", { name: "Scope", exact: true });
  await expect(scope.getByText("Listed on the mainnet site")).toHaveCount(3);
  await expect(scope.getByText("Not deployed yet")).toHaveCount(0);
  await expect(scope.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What was checked", exact: true }).getByRole("note")).toHaveCount(0);
});
