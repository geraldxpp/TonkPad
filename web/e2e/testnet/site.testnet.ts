import { expect, type Page, test } from "@playwright/test";
import { STUB_EVM_HASH } from "../../src/shared/wallet/stub-driver";
import { FIXTURE_LAUNCHPAD, STUB_BALANCE, STUB_WALLET } from "./fixtures";

// This build is the testnet site (NEXT_PUBLIC_TONK_NETWORK=testnet). The chain is a local stand-in:
// the launchpad's settings and the wallet's balance come from it, and nothing is simulated or sent.

const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
const TOKEN = "0x1111111111111111111111111111111111111111";
const summary = (page: Page) => page.getByRole("region", { name: "Your launch, at a glance." });

test("Launch reads the launchpad's own settings, and the site says it is the testnet", async ({ page }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { level: 1, name: "Launch a mission." })).toBeVisible();
  await expect(page.getByRole("banner").getByText("Testnet", { exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByText("Robinhood Chain Testnet · 46630")).toBeVisible();
  // The demo's tag and the mainnet-only search are gone.
  await expect(page.getByText("Demo", { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder("Search token, ticker or CA")).toHaveCount(0);

  // 0.0001 test ETH to launch; the middle preset is the reserve ÷ 24.
  await expect(summary(page).getByText("Robinhood Chain Testnet")).toBeVisible();
  await expect(summary(page).getByText("0.0001 test ETH", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Initial dev buy in test ETH")).toHaveValue("0.0000625");
  await expect(summary(page).getByTestId("launch-pay")).toHaveText("0.0001625 test ETH");
});

test("screens that aren't on the testnet yet say so, and swaps are closed", async ({ page, request }) => {
  // Explore says so above its address box and latest launches; the token page is on testnet (token.testnet.ts).
  for (const path of ["/", "/swap", "/portfolio"]) {
    await page.goto(path);
    await expect(page.getByText("Not on testnet yet"), path).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Launch" }), path).toBeVisible();
  }
  await page.getByRole("link", { name: "Open Launch" }).click();
  await expect(page).toHaveURL(/\/launch$/);

  // Testnet tokens have no market, so there is no portfolio to add up here yet.
  const holdings = await request.get(`/api/portfolio/rh/${STUB_WALLET}`);
  expect([holdings.status(), await holdings.json()]).toEqual([404, { error: "closed" }]);

  const quote = await request.get(`/api/swap/quote?chain=rh&from=ETH&to=${TOKEN}&amount=1000000000000000`);
  expect(quote.status()).toBe(403);
  expect(await quote.json()).toMatchObject({ error: "closed" });
});

test("the launchpad's routes answer from the chain, and refuse what breaks a rule", async ({ request }) => {
  const settings = await request.get("/api/tonk/settings");
  expect(settings.status()).toBe(200);
  expect(await settings.json()).toMatchObject({ ...FIXTURE_LAUNCHPAD, paused: false });
  // Balances on this site are the testnet's, from the same RPC.
  const balance = await request.get(`/api/wallet/rh/${STUB_WALLET}`);
  expect((await balance.json()).native).toMatchObject({ raw: STUB_BALANCE, decimals: 18 });

  const launch = await request.post("/api/tonk/launch", { data: { creator: STUB_WALLET, name: "", symbol: "X" } });
  expect(launch.status()).toBe(400);
  expect(await launch.json()).toEqual({ error: "invalid" });
  const tx = await request.get("/api/tonk/tx?hash=0x1234");
  expect(tx.status()).toBe(400);
  expect(await tx.json()).toEqual({ error: "invalid" });
});

test("a launch runs to its receipt, with the testnet explorer's links", async ({ page, request }) => {
  // The launch itself is answered in the browser: the fixture refuses to simulate or send one.
  const settings = (await (await request.get("/api/tonk/settings")).json()) as { launchFee: string };
  const bought = "38750736935158547404541542";
  const locked = "31000589548126837923633233";
  await page.route("**/api/tonk/launch", (route) => {
    const body = route.request().postDataJSON() as { devBuy: string };
    return route.fulfill({ json: { tx: { to: TOKEN, data: "0x", value: String(BigInt(settings.launchFee) + BigInt(body.devBuy)), gas: "2000000" }, settings, bought, locked } });
  });
  const mission = {
    token: TOKEN, creator: STUB_WALLET, name: "Tonk Test One", symbol: "TTONE", crewBps: 200, creatorBps: 100, lockType: "linear", lockedBps: 8000,
    lockEnd: 1_800_000_000, devBuy: "62500000000000", bought, locked, protocolFee: "625000000000", creatorFee: "625000000000", block: 151_200_000,
  };
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission, events: [] } }));

  await page.goto("/launch");
  await page.getByLabel("Token name").fill("Tonk Test One");
  await page.getByLabel("Ticker", { exact: true }).fill("TTONE");
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  // The stub wallet's 0.5 test ETH, read from the fixture, covers the launch.
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "One final look." });
  await expect(dialog.getByText("0.0001625 test ETH")).toBeVisible();
  await dialog.getByLabel("I have checked these settings.").check();
  await dialog.getByRole("button", { name: "Launch $TTONE" }).click();

  await expect(page).toHaveURL(new RegExp(`/launch\\?tx=${STUB_EVM_HASH}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Mission launched" })).toBeVisible();
  await expect(page.getByText("Tonk Test One is live on Robinhood Chain Testnet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", `${EXPLORER}/tx/${STUB_EVM_HASH}`);
  await expect(page.getByRole("link", { name: "View token on the explorer" })).toHaveAttribute("href", `${EXPLORER}/address/${TOKEN}`);
  // The launched token has a page on this site.
  await expect(page.getByRole("link", { name: "Open token page" })).toHaveAttribute("href", `/token/${TOKEN}`);
});

test("a wallet short of test ETH is pointed to the faucet", async ({ page }) => {
  await page.route("**/api/wallet/rh/**", (route) => {
    const owner = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ json: { chain: "rh", owner, native: { raw: "1000", decimals: 18 }, token: null, readAt: Date.now() } });
  });
  await page.goto("/launch");
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  await expect(summary(page).getByRole("button", { name: "Not enough test ETH" })).toHaveAttribute("aria-disabled", "true");
  await expect(summary(page).getByRole("link", { name: "Get test ETH" })).toHaveAttribute("href", "https://faucet.testnet.chain.robinhood.com");
});
