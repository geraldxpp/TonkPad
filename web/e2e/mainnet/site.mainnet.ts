import { expect, type Page, test } from "@playwright/test";
import { poolIdOf } from "../../src/shared/tonk/server/pool";
import { STUB_EVM_HASH, STUB_STORAGE_KEY } from "../../src/shared/wallet/stub-driver";
import { GRAD, TTONE } from "../testnet/fixture-chain";
import { MAINNET_DEPLOYMENT, STUB_WALLET } from "../testnet/fixtures";

// This build is the site in mainnet mode (NEXT_PUBLIC_TONK_NETWORK=mainnet, a made-up deployment). The chain is
// the local stand-in serving as Robinhood Chain mainnet: nothing is simulated or sent there, so what the server
// would build is answered here, in the browser, and the stub wallet "sends" it without signing anything.

const BETA = "Beta: these contracts haven't had an independent audit yet. Only put in what you can afford to lose.";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const ROUTER = "0x204faca1764b154221e35c0d20abb3c525710498";
const ZERO = "0x0000000000000000000000000000000000000000";
const tradePanel = (page: Page) => page.getByRole("region", { name: "Trade", exact: true });

/** Opens the page with the stub wallet already connected on Robinhood Chain: a remembered session, restored on load. */
async function connected(page: Page): Promise<void> {
  await page.addInitScript(([key, value]) => {
    localStorage.setItem("tonkpad-wallet", "1");
    localStorage.setItem(key, value);
  }, [STUB_STORAGE_KEY, JSON.stringify({ active: "rh", chains: ["rh"] })] as const);
}

/** GRAD's pool, as the migrator keys it: ETH against the token, its fee, and the guard as hook. */
const GRAD_POOL = poolIdOf({ currency0: ZERO, currency1: GRAD.token as `0x${string}`, fee: (100 + GRAD.crewBps + GRAD.creatorBps) * 100, tickSpacing: 60, hooks: MAINNET_DEPLOYMENT.guard });
const GRAD_OUT = "4000000000000000000000000";

test("Launch is live: the launchpad's own settings, the beta notice, the 1% lock rule, and no testnet marks", async ({ page }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { level: 1, name: "Launch a mission." })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Beta:" })).toHaveText(BETA);
  await expect(page.getByRole("banner").getByText("Testnet", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Demo", { exact: true })).toHaveCount(0);
  // 0.005 ETH to launch, read from the launchpad, in ETH rather than test ETH.
  await expect(page.getByRole("region", { name: "Your launch, at a glance." }).getByText("0.005 ETH", { exact: true })).toBeVisible();
  await expect(page.getByText("test ETH")).toHaveCount(0);
  await expect(page.getByText("Standard and Ironclad also need 10,000,000 tokens locked: 1% of supply.")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/mainnet-launch-1440.png" });
});

test("Explore lists the launchpad's latest launches and opens a launch by its address", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Latest launches" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tonk Test One/ })).toBeVisible();
  await page.getByLabel("Token address").fill(TTONE.token);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/token/${TTONE.token}$`, "i"));
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
});

test("a mission's page: the beta notice, its explorer, and a market that waits for the ETH price rather than guess", async ({ page }) => {
  await page.goto(`/token/${TTONE.token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Beta:" })).toHaveText(BETA);
  await expect(page.getByRole("main").getByRole("link", { name: "View token on the explorer" })).toHaveAttribute("href", `${EXPLORER}/address/${TTONE.token}`);
  // No live feed in this run, so no ETH price: figures in ETH never appear under a dollar sign, and nothing says test ETH.
  await expect(page.getByText("test ETH")).toHaveCount(0);
  // What waits for the indexer is "coming soon" here, never the testnet's wording.
  await expect(page.getByText(/Not on testnet yet/)).toHaveCount(0);
  await expect(page.getByText("Top 10 holders · Coming soon")).toBeVisible();
  await expect(tradePanel(page).getByLabel("You pay")).toBeVisible();
});

test("a graduated mission trades on its Uniswap pool: the quote, the review, the wallet, then the swap its receipt shows", async ({ page }) => {
  await connected(page);
  const quotes: URLSearchParams[] = [];
  await page.route("**/api/tonk/pool/quote?**", (route) => {
    const asked = new URL(route.request().url()).searchParams;
    quotes.push(asked);
    return route.fulfill({ json: { pool: GRAD_POOL, side: asked.get("side"), amountIn: asked.get("amount"), out: GRAD_OUT, feeBps: 150, block: 151000000 } });
  });
  const builds: Record<string, string>[] = [];
  await page.route("**/api/tonk/pool/trade", (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    builds.push(body);
    const quote = { pool: GRAD_POOL, side: "buy", amountIn: body.amount, out: GRAD_OUT, feeBps: 150, block: 151000000 };
    return route.fulfill({ json: { step: "trade", tx: { to: ROUTER, data: "0x", value: body.amount, gas: "300000" }, quote } });
  });
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: null, events: [{ kind: "pool", pool: GRAD_POOL, side: "buy", eth: "10000000000000000", tokens: GRAD_OUT }] } }));

  await page.goto(`/token/${GRAD.token}`);
  const panel = tradePanel(page);
  await expect(panel.getByText("Uniswap v4 pool · 1.5% fee, shared by the protocol, Crew and Creator")).toBeVisible();
  await panel.getByLabel("You pay").fill("0.01");
  await expect.poll(() => quotes.length).toBeGreaterThan(0);
  expect(Object.fromEntries(quotes[0])).toEqual({ token: GRAD.token, side: "buy", amount: "10000000000000000" });
  await expect(panel.getByRole("button", { name: "Review buy" })).toBeEnabled();
  await page.screenshot({ path: "e2e/screenshots/mainnet-token-pool-1440.png" });
  await panel.getByRole("button", { name: "Review buy" }).click();

  const review = page.getByRole("dialog");
  await expect(review.getByText("Uniswap v4", { exact: true })).toBeVisible();
  await expect(review.getByText("Pool fee · 1.5%")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/mainnet-pool-review-1440.png" });
  await review.getByRole("button", { name: "Buy $GRAD" }).click();

  await expect(page).toHaveURL(new RegExp(`\\?tx=${STUB_EVM_HASH}$`));
  await expect(panel.getByText(/^Bought .+ \$GRAD$/)).toBeVisible();
  // The build asked for exactly the amount typed, at most 1% (the default slippage) under the quote.
  expect(builds).toEqual([{ token: GRAD.token, trader: STUB_WALLET, side: "buy", amount: "10000000000000000", minOut: "3960000000000000000000000" }]);
});

test("a receipt's swap on some other pool is never shown as this token's trade", async ({ page }) => {
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: null, events: [{ kind: "pool", pool: `0x${"ab".repeat(32)}`, side: "buy", eth: "1", tokens: "1" }] } }));
  await page.goto(`/token/${GRAD.token}?tx=${STUB_EVM_HASH}`);
  await expect(tradePanel(page).getByText("That transaction did something else. Check it on the explorer.")).toBeVisible();
  await expect(tradePanel(page).getByText(/^Bought /)).toHaveCount(0);
});

test("tokens the launchpad doesn't know keep their own pages, and Swap, Bridge and Portfolio stay open", async ({ page }) => {
  // A Solana mock token is never asked about; an unknown address on Robinhood Chain isn't a mission.
  await page.goto("/token/SCAT");
  await expect(page.getByRole("heading", { level: 1, name: "Sol Cat" })).toBeVisible();
  await page.goto("/token/0x9999999999999999999999999999999999999999");
  await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
  for (const path of ["/swap", "/bridge", "/portfolio"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Not on testnet yet")).toHaveCount(0);
  }
});
