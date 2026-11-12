import { expect, type Page, test } from "@playwright/test";
import { poolIdOf } from "../../src/shared/tonk/server/pool";
import { STUB_EVM_HASH, STUB_STORAGE_KEY } from "../../src/shared/wallet/stub-driver";
import { GRAD, TTONE } from "../testnet/fixture-chain";
import { E2E_IMAGE_HOST, HIDDEN_IMAGE_HASH, MAINNET_DEPLOYMENT, MAINNET_PONS_TOKEN, STUB_WALLET, TTONE_IMAGE } from "../testnet/fixtures";
import { expectTokenImage, serveTokenImages } from "../helpers";

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

test("while launches are invite-only, a wallet off the list is told so and can't review a launch", async ({ page }) => {
  await connected(page);
  const builds: unknown[] = [];
  await page.route("**/api/tonk/launch", (route) => {
    builds.push(route.request().postDataJSON());
    return route.fulfill({ status: 403, json: { error: "invite" } });
  });
  await page.goto("/launch");
  await expect(page.getByRole("note").filter({ hasText: "invite-only" })).toHaveText("Launch is invite-only for now. For the first days, only invited creators can launch here.");
  const button = page.getByRole("button", { name: "Invite-only for now" }).first();
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await button.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(builds).toEqual([]);
});

test("Explore lists the launchpad's latest launches and opens a launch by its address", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Latest launches" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Latest launches" }).getByRole("link", { name: /Tonk Test One/ })).toBeVisible();
  await page.getByLabel("Token address").fill(TTONE.token);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/token/${TTONE.token}$`, "i"));
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
});

test("a mission's page: the beta notice, its explorer, and its holders and top traders from the indexer", async ({ page }) => {
  await page.goto(`/token/${TTONE.token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Beta:" })).toHaveText(BETA);
  await expect(page.getByRole("main").getByRole("link", { name: "View token on the explorer" })).toHaveAttribute("href", `${EXPLORER}/address/${TTONE.token}`);
  // Mainnet counts in ETH and dollars, never in test ETH, and never with the testnet's wording.
  await expect(page.getByText("test ETH")).toHaveCount(0);
  await expect(page.getByText(/Not on testnet yet/)).toHaveCount(0);
  // The top 10 holders' share, as the worker counts it: system addresses and dust left out.
  await expect(page.getByText(/^Top 10 holders · (healthy|spread|concentrated)$/)).toBeVisible();
  const activity = page.getByRole("region", { name: "Activity" });
  await activity.getByRole("tab", { name: "Holders · 7" }).click();
  const holders = activity.getByRole("table", { name: "Holders" });
  // The creator's locked tokens and the pool are labelled, with no rank: they aren't counted.
  for (const label of ["Locked (creator)", "Uniswap pool"]) {
    const row = holders.getByRole("row").filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").first()).toHaveText("—");
  }
  await page.screenshot({ path: "e2e/screenshots/mainnet-token-holders-1440.png" });
  await activity.getByRole("tab", { name: "Top traders" }).click();
  const traders = activity.getByRole("table", { name: "Top traders" });
  await expect(traders.getByRole("columnheader", { name: "Still held" })).toBeVisible();
  // The best realised profit first: the wallet that sold out, on the curve and the pool.
  await expect(traders.getByRole("row").nth(1).getByRole("cell").nth(1)).toHaveText(/^\+\$/);
  await expect(tradePanel(page).getByLabel("You pay")).toBeVisible();
});

test("when the indexer can't be reached, holders, top traders and the top-10 share say so, never a stand-in", async ({ page }) => {
  await page.route("**/api/live/token/**", (route) => route.fulfill({ status: 502, json: { error: "live data unavailable" } }));
  await page.goto(`/token/${TTONE.token}?tab=holders`);
  const activity = page.getByRole("region", { name: "Activity" });
  await expect(activity.getByRole("tab", { name: "Holders · —" })).toBeVisible();
  await expect(activity.getByText("Data unavailable")).toBeVisible();
  await expect(page.getByText("Top 10 holders · Data unavailable")).toBeVisible();
  await activity.getByRole("tab", { name: "Top traders" }).click();
  await expect(activity.getByText("Data unavailable")).toBeVisible();
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

test("anyone shares a graduated pool's fees: the server builds it, the wallet sends it, and the receipt says who got what", async ({ page }) => {
  await connected(page);
  const asked: Record<string, string>[] = [];
  await page.route("**/api/tonk/action", (route) => {
    asked.push(route.request().postDataJSON() as Record<string, string>);
    return route.fulfill({ json: { tx: { to: MAINNET_DEPLOYMENT.migrator, data: "0x", value: "0", gas: "250000" } } });
  });
  const shared = { kind: "shared", token: GRAD.token, protocolEth: "2500000000000000", crewEth: "0", creatorEth: "500000000000000", tokensBurned: "1000" };
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: null, events: [shared] } }));

  await page.goto(`/token/${GRAD.token}`);
  const fees = page.getByRole("region", { name: "Pool fees" });
  await expect(fees.getByText("Crew 0% · Creator 0.5% · tonkfun.fun 1%")).toBeVisible();
  await fees.getByRole("button", { name: "Share pool fees" }).click();
  await expect(fees.getByText(/^Shared 0\.003 ETH: \S+ to the Crew, 0\.0005 to the creator, 0\.0025 to tonkfun\.fun\.$/)).toBeVisible();
  // Any wallet may share: the request names the token and the wallet that pays the network fee.
  expect(asked).toEqual([{ kind: "share", token: GRAD.token, owner: STUB_WALLET }]);
});

test("a receipt's swap on some other pool is never shown as this token's trade", async ({ page }) => {
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: null, events: [{ kind: "pool", pool: `0x${"ab".repeat(32)}`, side: "buy", eth: "1", tokens: "1" }] } }));
  await page.goto(`/token/${GRAD.token}?tx=${STUB_EVM_HASH}`);
  await expect(tradePanel(page).getByText("That transaction did something else. Check it on the explorer.")).toBeVisible();
  await expect(tradePanel(page).getByText(/^Bought /)).toHaveCount(0);
});

test("Explore lists the launchpad's own launches from the live feed: Locked Missions, with their badges", async ({ page }) => {
  await serveTokenImages(page);
  await page.goto("/?tab=locked");
  const row = page.getByRole("row").filter({ hasText: "Tonk Test One" });
  await expect(row).toHaveCount(1);
  for (const badge of ["Locked", "Block-0 Shield", "Crew 2%", "Agent"]) await expect(row.getByText(badge, { exact: true })).toBeVisible();
  // Graduated on its own pool; the feed counts its holders exactly, system addresses and dust left out.
  await expect(row.getByText("Graduated", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/mainnet-explore-locked-1440.png" });
  await row.getByRole("link", { name: "Tonk Test One" }).click();
  await expect(page).toHaveURL(new RegExp(`/token/${TTONE.token}$`, "i"));
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
});

test("tokens the launchpad doesn't know keep their own pages, and Swap, Bridge and Portfolio stay open", async ({ page }) => {
  // A token the live feed lists that isn't a mission shows as itself; an address neither knows isn't found.
  await page.goto(`/token/${MAINNET_PONS_TOKEN}`);
  await expect(page.getByRole("heading", { level: 1, name: "Pons Pal" })).toBeVisible();
  await page.goto("/token/0x9999999999999999999999999999999999999999");
  await expect(page.getByText("This token is no longer available in the live feed.").first()).toBeVisible();
  for (const path of ["/swap", "/bridge", "/portfolio"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Not on testnet yet")).toHaveCount(0);
  }
});

test("a launch's own image shows in Explore and on its page; a hidden one never reaches the browser", async ({ page, request }) => {
  const served = await serveTokenImages(page);
  await page.goto("/?tab=locked");
  await expectTokenImage(page.getByRole("row").filter({ hasText: "Tonk Test One" }), TTONE_IMAGE);
  await page.goto(`/token/${TTONE.token}`);
  await expectTokenImage(page.getByRole("main"), TTONE_IMAGE);

  // GRAD's image is on the owner's hide list: its page shows the letter, and its mission never carries the address.
  await page.goto(`/token/${GRAD.token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Graduate" })).toBeVisible();
  await expect(page.getByRole("main").locator(`img[src*="${E2E_IMAGE_HOST}"]`)).toHaveCount(0);
  const { mission } = (await (await request.get(`/api/tonk/token/${GRAD.token}`)).json()) as { mission: { metadata: string } };
  expect(mission.metadata).toBe('{"v":1}');
  expect(served.some((address) => address.includes(HIDDEN_IMAGE_HASH))).toBe(false);
});
