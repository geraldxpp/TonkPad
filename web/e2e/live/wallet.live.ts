import { expect, type Page, test } from "@playwright/test";
import { LIVE_ROBINHOOD, LIVE_SOLANA } from "./fixtures";
import { STUB_STORAGE_KEY } from "../../src/shared/wallet/stub-driver";
import { STUB_WALLET } from "./wallet-fixtures";

const tradePanel = (page: Page) => page.getByRole("region", { name: "Trade", exact: true });
const SOON = "Trading opens soon: nothing can be signed or sent yet.";

test("a Solana wallet sees its real SOL and token balance, and nothing can be traded", async ({ page }, testInfo) => {
  await page.goto(`/token/${LIVE_SOLANA.address}`);
  const trade = tradePanel(page);
  await expect(trade.getByText("Balance —")).toBeVisible();
  await trade.getByRole("button", { name: "Connect wallet" }).click();

  // The stub connects at once; the balances come from the fixture RPC through /api/wallet.
  await expect(page.getByRole("banner").getByRole("button", { name: "Wallet FLRe…SuCv on Solana" })).toBeVisible();
  await expect(trade.getByText("Balance 1.5 SOL on Solana")).toBeVisible();
  const buy = trade.getByRole("button", { name: "Buy $LVS · 0.05 SOL" });
  await expect(buy).toHaveAttribute("aria-disabled", "true");
  await expect(buy).toHaveAccessibleDescription(SOON);
  await expect(trade.getByRole("button", { name: /Need funds/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("wallet-live-sol-1440.png"), fullPage: true });

  await trade.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(trade.getByText("Balance 2.50M LVS")).toBeVisible();
  await trade.getByRole("group", { name: "Amount presets" }).getByRole("button", { name: "Max" }).click();
  await expect(trade.getByLabel("You sell")).toHaveValue("2.5");
  await expect(trade.getByRole("button", { name: "Sell 2.5M $LVS" })).toHaveAttribute("aria-disabled", "true");

  // Disconnecting from the top bar takes the balances away again.
  await page.getByRole("banner").getByRole("button", { name: "Wallet FLRe…SuCv on Solana" }).click();
  await page.getByRole("banner").getByRole("button", { name: "Disconnect" }).click();
  await expect(trade.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(trade.getByText("Balance —")).toBeVisible();
});

test("a Robinhood Chain token asks a Solana wallet's owner for one on its chain, then shows ETH and the token", async ({ page }) => {
  await page.addInitScript(([key, saved]) => {
    localStorage.setItem("tonkpad-wallet", "1");
    localStorage.setItem(key, saved);
  }, [STUB_STORAGE_KEY, JSON.stringify({ active: "sol", chains: ["sol"] })] as const);
  await page.goto(`/token/${LIVE_ROBINHOOD.address}`);
  const trade = tradePanel(page);
  const connect = trade.getByRole("button", { name: "Connect a Robinhood Chain wallet" });
  await expect(connect).toBeVisible();
  await expect(connect).toHaveAccessibleDescription("Connecting shares only your address. Nothing is signed.");
  await connect.click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Wallet 0x7a5e…c0de on Robinhood Chain" })).toBeVisible();
  await expect(trade.getByText("Balance 0.25 ETH on Robinhood Chain")).toBeVisible();
  await trade.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(trade.getByText("Balance 1.00M LVR")).toBeVisible();
  await expect(trade.getByText(SOON)).toBeVisible();
});

test("the balance route answers only for addresses in the chain's own format", async ({ request }) => {
  const sol = await request.get(`/api/wallet/sol/${STUB_WALLET.sol}?token=${LIVE_SOLANA.address}`);
  expect(sol.ok()).toBe(true);
  expect(await sol.json()).toMatchObject({
    chain: "sol",
    owner: STUB_WALLET.sol,
    native: { raw: "1500000000", decimals: 9 },
    token: { address: LIVE_SOLANA.address, amount: { raw: "2500000000000", decimals: 6 } },
  });
  const rh = await request.get(`/api/wallet/rh/${STUB_WALLET.rh}`);
  expect(await rh.json()).toMatchObject({ chain: "rh", native: { raw: "250000000000000000", decimals: 18 }, token: null });

  for (const path of [
    `/api/wallet/sol/not-a-wallet`,
    `/api/wallet/rh/${STUB_WALLET.sol}`,
    `/api/wallet/sol/${STUB_WALLET.sol}?token=${LIVE_ROBINHOOD.address}`,
    `/api/wallet/eth/${STUB_WALLET.rh}`,
  ]) {
    expect((await request.get(path)).status(), path).toBe(400);
  }
});
