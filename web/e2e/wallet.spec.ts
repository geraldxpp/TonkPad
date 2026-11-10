import { expect, type Page, test } from "@playwright/test";
import { STUB_ACCOUNTS, STUB_STORAGE_KEY } from "../src/shared/wallet/stub-driver";
import { openExplore } from "./helpers";

/** These builds use the stub wallet (NEXT_PUBLIC_WALLET_STUB=1): it connects at once with fixed addresses. */
const SOL_LABEL = "Wallet FLRe…SuCv on Solana";
const RH_LABEL = "Wallet 0x7a5e…c0de on Robinhood Chain";

const header = (page: Page) => page.getByRole("banner");

/** True when the element draws the app's 2 px focus ring. */
const hasRing = (page: Page, name: string) =>
  header(page)
    .getByRole("button", { name, exact: true })
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle === "solid" && s.outlineWidth === "2px" && s.outlineColor === "rgb(74, 156, 245)";
    });

/** Starts a page with the stub already connected, as if the visitor connected on an earlier visit. */
async function connectedBefore(page: Page, chain: "sol" | "rh") {
  await page.addInitScript(([key, saved]) => {
    localStorage.setItem("tonkpad-wallet", "1");
    localStorage.setItem(key, saved);
  }, [STUB_STORAGE_KEY, JSON.stringify({ active: chain, chains: [chain] })] as const);
}

test("connect Solana, copy its address, add Robinhood Chain, switch back, reload and disconnect", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openExplore(page);
  const bar = header(page);
  const connect = bar.getByRole("button", { name: "Connect wallet" });
  await connect.click();
  await expect(connect).toHaveAttribute("aria-expanded", "true");
  await expect(bar.getByText("Connecting shares only your address. Nothing is signed.")).toBeVisible();
  await bar.getByRole("button", { name: "Connect a Solana wallet" }).click();

  const solana = bar.getByRole("button", { name: SOL_LABEL });
  await expect(solana).toBeVisible();
  await expect(solana).toHaveText("FLRe…SuCv");
  await solana.click();
  await expect(bar.getByText("Connected on Solana")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("wallet-menu-1440.png") });
  await bar.getByRole("button", { name: "Copy address" }).click();
  await expect(bar.getByText("Address copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(STUB_ACCOUNTS.sol);

  // The other chain connects alongside: Solana stays connected.
  await bar.getByRole("button", { name: "Connect a Robinhood Chain wallet" }).click();
  const robinhood = bar.getByRole("button", { name: RH_LABEL });
  await expect(robinhood).toBeVisible();
  await robinhood.click();
  await bar.getByRole("button", { name: "Switch to Solana" }).click();
  await expect(bar.getByText("Connected on Solana")).toBeVisible();
  await expect(solana).toBeVisible();

  // The connections come back after a reload, like a saved wallet session.
  await page.reload();
  await expect(solana).toBeVisible();
  await solana.click();
  await expect(bar.getByRole("button", { name: "Switch to Robinhood Chain" })).toBeVisible();

  await bar.getByRole("button", { name: "Disconnect" }).click();
  await expect(connect).toBeVisible();
  await expect(connect).toBeFocused();
  await page.reload();
  await expect(connect).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tonkpad-wallet"))).toBeNull();
});

test("the wallet menu works from the keyboard and shows the focus ring", async ({ page }) => {
  await openExplore(page);
  const bar = header(page);
  const connect = bar.getByRole("button", { name: "Connect wallet" });
  await connect.focus();
  await page.keyboard.press("Enter");
  const solana = bar.getByRole("button", { name: "Connect a Solana wallet" });
  await expect(solana).toBeFocused();
  expect(await hasRing(page, "Connect a Solana wallet")).toBe(true);

  // Escape closes the menu and gives focus back to the button.
  await page.keyboard.press("Escape");
  await expect(solana).toBeHidden();
  await expect(connect).toBeFocused();
  expect(await hasRing(page, "Connect wallet")).toBe(true);

  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(bar.getByRole("button", { name: "Connect a Robinhood Chain wallet" })).toBeFocused();
  await page.keyboard.press("Enter");
  const account = bar.getByRole("button", { name: RH_LABEL });
  await expect(account).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(bar.getByRole("button", { name: "Copy address" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(bar.getByRole("button", { name: "Disconnect" })).toBeFocused();
  expect(await hasRing(page, "Disconnect")).toBe(true);
  // Tabbing out of the menu closes it.
  await page.keyboard.press("Tab");
  await expect(bar.getByRole("button", { name: "Disconnect" })).toBeHidden();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /** The wallet button keeps its place at the end of the row, 4 px after the bell (the logo's margin takes the slack). */
  async function expectAfterBell(page: Page, name: string) {
    const bell = (await header(page).getByRole("button", { name: "Alerts" }).boundingBox())!;
    const wallet = (await header(page).getByRole("button", { name }).boundingBox())!;
    expect(Math.round(wallet.x - (bell.x + bell.width))).toBe(4);
  }

  test("connect and disconnect from the More sheet; the top bar stays one row", async ({ page }) => {
    await openExplore(page);
    await expectAfterBell(page, "Connect wallet");
    const more = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" });
    await more.tap();
    const sheet = page.getByRole("dialog", { name: "Settings" });
    await sheet.getByRole("button", { name: "Connect a Robinhood Chain wallet" }).tap();
    await expect(sheet).toBeHidden();
    const account = header(page).getByRole("button", { name: RH_LABEL });
    await expect(account).toBeVisible();
    await expectAfterBell(page, RH_LABEL);
    expect((await header(page).boundingBox())!.height).toBeLessThan(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

    await more.tap();
    await expect(sheet.getByText("Connected on Robinhood Chain")).toBeVisible();
    await sheet.getByRole("button", { name: "Disconnect" }).tap();
    await expect(sheet).toBeHidden();
    await expect(header(page).getByRole("button", { name: "Connect wallet" })).toBeVisible();
  });

  for (const [lang, theme, chain, label] of [
    ["de", "light", "sol", "Wallet FLRe…SuCv auf Solana"],
    ["ru", "dark", "rh", "Кошелёк 0x7a5e…c0de в Robinhood Chain"],
  ] as const) {
    test(`${lang}, ${theme} theme: a connected wallet and its menu fit 390 px`, async ({ page }, testInfo) => {
      await connectedBefore(page, chain);
      await page.addInitScript((saved) => localStorage.setItem("tonkpad-theme", saved), theme);
      await page.goto(`/${lang}`);
      const account = header(page).getByRole("button", { name: label });
      await expect(account).toBeVisible();
      await account.tap();
      const disconnect = header(page).getByRole("button", { name: lang === "de" ? "Trennen" : "Отключить" });
      await expect(disconnect).toBeVisible();
      const box = (await disconnect.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect((await header(page).boundingBox())!.height).toBeLessThan(64);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`wallet-390-${lang}-${theme}.png`) });
    });
  }
});
