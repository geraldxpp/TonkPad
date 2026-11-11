import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { de } from "../src/shared/i18n/dictionaries/de";
import { ru } from "../src/shared/i18n/dictionaries/ru";
import { STUB_ACCOUNTS, STUB_STORAGE_KEY } from "../src/shared/wallet/stub-driver";

// The screen is real; the wallet is the stub, and every /api/portfolio read is answered here in the browser, so no test reaches a provider.

const SOL = STUB_ACCOUNTS.sol;
const RH = STUB_ACCOUNTS.rh;
const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const NO_CHANGE = { m5: null, h1: null, h6: null, h24: null };

interface Spec {
  chain: "sol" | "rh";
  address: string;
  symbol: string;
  name: string;
  art?: string;
  balance: number;
  price: number | null;
  change?: number | null;
  native?: boolean;
  stable?: boolean;
  track?: "SOL" | "ETH" | null;
}

const asset = ({ chain, address, symbol, name, art = "", balance, price, change = null, native = false, stable = false, track = null }: Spec) => ({
  chain, address, symbol, name, art, decimals: 6, raw: String(Math.round(balance * 1e6)), balance, priceUsd: price, valueUsd: price === null ? null : balance * price, change: { ...NO_CHANGE, h24: change }, native, stable, track,
});

/** The design's sample wallets, so the screen can be held up against its reference. */
const RH_ASSETS = [
  asset({ chain: "rh", address: NATIVE_EVM, symbol: "ETH", name: "Ethereum", art: "/coins/eth.svg", balance: 0.42, price: 3412, change: 2.8, native: true, track: "ETH" }),
  asset({ chain: "rh", address: USDG, symbol: "USDG", name: "Global Dollar", art: "/coins/usdg.svg", balance: 1250, price: 1, change: 0.01, stable: true }),
  asset({ chain: "rh", address: "0x5e1d7c4b92a03f6e18d5b7c2a94e6f01d3c8a0f3", symbol: "GHOST", name: "Ghosty", art: "/tokens/ghost.svg", balance: 100_000, price: 0.0000582, change: 412.6 }),
  asset({ chain: "rh", address: "0x46f37a5b8d126490bd7c302a6e21e537c0d81709", symbol: "ORB", name: "Orbit", art: "/tokens/orb.svg", balance: 24_000, price: 0.0000641, change: 221 }),
  asset({ chain: "rh", address: "0x80e73e479b41fd2a9e5197dce1276370d99a1211", symbol: "BOLT", name: "Bolt", art: "/tokens/bolt.svg", balance: 5000, price: 0.000276, change: 64.9 }),
];
const SOL_ASSETS = [
  asset({ chain: "sol", address: SOL_MINT, symbol: "SOL", name: "Solana", art: "/chains/sol.png", balance: 2.8, price: 182.4, change: 4.3, native: true, track: "SOL" }),
  asset({ chain: "sol", address: USDC_MINT, symbol: "USDC", name: "USD Coin", art: "/coins/usdc.svg", balance: 580, price: 1, change: 0.01, stable: true }),
  asset({ chain: "sol", address: "SCATdesignsampleSolanaTokenAddress11111111", symbol: "SCAT", name: "Sol Cat", art: "/tokens/scat.svg", balance: 42_000, price: 0.00118, change: 96.4 }),
  asset({ chain: "sol", address: "SHRMdesignsampleSolanaTokenAddress11111111", symbol: "SHRM", name: "Shroom", art: "/tokens/shrm.svg", balance: 180_000, price: 0.0000374, change: -12.4 }),
];
const SPAM = asset({ chain: "sol", address: "SPAMdesignsampleSolanaTokenAddress11111111", symbol: "FREE", name: "Claim at scam.example", balance: 1000, price: null });

const portfolio = (chain: "sol" | "rh", owner: string, assets: unknown[], patch: Record<string, unknown> = {}) => ({ chain, owner, assets, unpriced: 0, partial: false, readAt: Date.now(), ...patch });

const activityItem = (patch: Record<string, unknown>) => ({ id: "0xaaa", chain: "rh", type: "receive", time: Date.now() - 60_000, failed: false, received: [], sent: [], counterparty: null, url: "https://robinhoodchain.blockscout.com/tx/0xaaa", ...patch });
const ACTIVITY_RH = [
  activityItem({ id: "0xswap", type: "swap", received: [{ symbol: "GHOST", amount: 100_000 }], sent: [{ symbol: "ETH", amount: 0.0017 }], url: "https://robinhoodchain.blockscout.com/tx/0xswap" }),
  activityItem({ id: "0xsend", type: "send", time: Date.now() - 86_400_000 * 3, sent: [{ symbol: "USDG", amount: 100 }], counterparty: "0x93a1000000000000000000000000000000007c2e" }),
];
const ACTIVITY_SOL = [activityItem({ id: "solreceive", chain: "sol", received: [{ symbol: "USDC", amount: 580 }], counterparty: "FriendWa11etFriendWa11etFriendWa11etFriend1", url: "https://solscan.io/tx/solreceive" })];
const OLDER_RH = [activityItem({ id: "0xolder", type: "receive", time: Date.now() - 86_400_000 * 9, received: [{ symbol: "ORB", amount: 24_000 }], counterparty: "0x11110000000000000000000000000000000022ab" })];

function candles(range: string) {
  const hours: Record<string, number> = { "1D": 24, "1W": 168, "1M": 720, "1Y": 8760 };
  const count = 40;
  const span = (hours[range] ?? 24) * 3_600_000;
  const series = (from: number, to: number) => Array.from({ length: count }, (_, i) => [Date.now() - span + (i * span) / count, from + ((to - from) * i) / (count - 1)]);
  return { range, SOL: series(170, 182.4), ETH: series(3300, 3412) };
}

interface Stubs {
  rh?: unknown | "fail";
  sol?: unknown | "fail";
}

/** Answers every portfolio read; returns how often activity was asked for. */
async function stub(page: Page, { rh = portfolio("rh", RH, RH_ASSETS), sol = portfolio("sol", SOL, SOL_ASSETS) }: Stubs = {}) {
  const asked = { activity: 0 };
  await page.route("**/api/portfolio/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/portfolio/market") return route.fulfill({ json: candles(url.searchParams.get("range") ?? "1D") });
    const [, , , chain, owner, rest] = url.pathname.split("/");
    if (rest === "activity") {
      asked.activity += 1;
      const cursor = url.searchParams.get("cursor");
      if (chain === "sol") return route.fulfill({ json: { chain, owner, items: ACTIVITY_SOL, next: null } });
      return route.fulfill({ json: cursor ? { chain, owner, items: OLDER_RH, next: null } : { chain, owner, items: ACTIVITY_RH, next: "100" } });
    }
    const answer = await (chain === "rh" ? rh : sol);
    return answer === "fail" ? route.fulfill({ status: 502, json: { error: "unavailable" } }) : route.fulfill({ json: answer });
  });
  await page.route("**/api/live/token/**", (route) => route.fulfill({ status: 404, json: { error: "not found" } }));
  return asked;
}

/** Starts a page with the stub already connected, as if the visitor connected on an earlier visit. */
const connected = (page: Page, chains: ("rh" | "sol")[] = ["rh", "sol"]) =>
  page.addInitScript(([key, saved]) => {
    localStorage.setItem("tonkpad-wallet", "1");
    localStorage.setItem(key, saved);
  }, [STUB_STORAGE_KEY, JSON.stringify({ active: chains[0], chains })] as const);

async function open(page: Page, search = "") {
  await page.goto(`/portfolio${search}`);
  await expect(page.getByTestId("portfolio-total")).toBeVisible();
}

const total = (page: Page) => page.getByTestId("portfolio-total");
const holdings = (page: Page) => page.getByRole("region", { name: "Portfolio assets and activity" });
const rowNames = (page: Page) => holdings(page).locator("tbody tr button strong").allTextContents();

test("without a wallet it says what it does and offers Connect; connecting shows the holdings", async ({ page }) => {
  await stub(page, { rh: portfolio("rh", RH, RH_ASSETS) });
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 1, name: "A little more perspective." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Connect to see your portfolio." })).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toHaveCount(0);
  // A Solana-only wallet has its own way in.
  await expect(page.getByRole("main").getByRole("button", { name: "Connect a Solana wallet" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Connect a Robinhood Chain wallet" }).click();
  await expect(total(page)).toHaveText("$2,691.78");
});

test("shows what both wallets hold, with the totals and the split between networks", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  await expect(total(page)).toHaveText("$3,838.79");
  const balance = page.getByRole("region", { name: "Total balance" });
  await expect(balance).toContainText("Assets held9");
  await expect(balance).toContainText("Networks2");
  await expect(balance).toContainText("Stablecoin balance$1,830.00");
  // The chart ends at the total and starts where SOL and ETH really were.
  await expect(balance.getByRole("img")).toHaveAttribute("aria-label", /to \$3,838\.79/);
  await expect(page.getByTestId("portfolio-change")).toHaveText(/^\+\$\d/);

  const wallets = page.getByRole("complementary", { name: "Across your wallets" });
  await expect(wallets.getByRole("button", { name: /Robinhood Chain/ })).toContainText("$2,691.78");
  await expect(wallets.getByRole("button", { name: /Robinhood Chain/ })).toContainText("70.1%");
  await expect(wallets.getByRole("button", { name: /Solana/ })).toContainText("$1,147.01");
  await expect(wallets.getByRole("img")).toHaveAttribute("aria-label", "Allocation: 70.1% Robinhood Chain, 29.9% Solana");

  expect(await rowNames(page)).toEqual(["Ethereum", "Global Dollar", "USD Coin", "Solana", "Sol Cat", "Shroom", "Ghosty", "Orbit", "Bolt"]);
  const row = holdings(page).locator("tbody tr").filter({ hasText: "Ghosty" });
  await expect(row).toContainText("$0.0000582");
  await expect(row).toContainText("+412.6%");
  await expect(row).toContainText("100,000 GHOST");
  await expect(row).toContainText("$5.82");
});

test("filters by network, and the URL can share the view", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  const filter = page.getByRole("group", { name: "Filter portfolio by network" });
  await filter.getByRole("button", { name: "Solana" }).click();
  await expect(page).toHaveURL(/chain=sol/);
  await expect(total(page)).toHaveText("$1,147.01");
  expect(await rowNames(page)).toEqual(["USD Coin", "Solana", "Sol Cat", "Shroom"]);
  await page.getByRole("group", { name: "Portfolio chart period" }).getByRole("button", { name: "1W" }).click();
  await expect(page).toHaveURL(/range=1W/);
  await expect(page.getByRole("region", { name: "Total balance" })).toContainText("Past 7 days");
  await expect(page.getByRole("region", { name: "Total balance" })).toContainText("7 days ago");

  await page.reload();
  await expect(total(page)).toHaveText("$1,147.01");
  await expect(filter.getByRole("button", { name: "Solana" })).toHaveAttribute("aria-pressed", "true");
});

test("searches, sorts, hides dust and resets", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  const panel = holdings(page);
  await panel.getByRole("searchbox", { name: "Search portfolio assets or activity" }).fill("usd");
  await expect.poll(() => rowNames(page)).toEqual(["Global Dollar", "USD Coin"]);
  await panel.getByRole("searchbox").fill("nothing-like-this");
  await expect(panel.getByText("No assets in this view.")).toBeVisible();
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await expect.poll(() => rowNames(page)).toHaveLength(9);

  await panel.getByLabel("Sort holdings").selectOption("name");
  await expect.poll(() => rowNames(page)).toEqual(["Bolt", "Ethereum", "Ghosty", "Global Dollar", "Orbit", "Shroom", "Sol Cat", "Solana", "USD Coin"]);
  await panel.getByLabel("Sort holdings").selectOption("change");
  await expect.poll(async () => (await rowNames(page))[0]).toBe("Ghosty");
  // Bound to the URL, so it settles a moment after the click.
  await panel.getByLabel("Hide under $5").click();
  await expect(panel.getByLabel("Hide under $5")).toBeChecked();
  await expect.poll(() => rowNames(page)).not.toContain("Bolt");
  await expect(page).toHaveURL(/small=hide/);
});

test("hides every figure, remembers it, and won't export while hidden", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  const balance = page.getByRole("region", { name: "Total balance" });
  await balance.getByRole("button", { name: "Hide portfolio balances" }).click();
  await expect(total(page)).toHaveText("••••");
  await expect(page.getByTestId("portfolio-change")).toHaveText("••••");
  await expect(balance.getByText("Your balance is hidden")).toBeVisible();
  await expect(balance.getByRole("button", { name: "Show balances to download them" })).toBeDisabled();
  await expect(holdings(page).locator("tbody tr").first()).not.toContainText("$");
  await expect(page.getByRole("complementary", { name: "Across your wallets" })).not.toContainText("$");

  await page.reload();
  await expect(total(page)).toHaveText("••••");
  await page.getByRole("button", { name: "Show portfolio balances" }).click();
  await expect(total(page)).toHaveText("$3,838.79");
});

test("downloads the holdings on screen as a CSV a spreadsheet can't be tricked by", async ({ page }) => {
  const evil = asset({ chain: "sol", address: "EVILdesignsampleSolanaTokenAddress11111111", symbol: "EVL", name: '=HYPERLINK("http://evil.example","x")', balance: 10, price: 1, change: 1 });
  await stub(page, { sol: portfolio("sol", SOL, [...SOL_ASSETS, evil]) });
  await connected(page);
  await open(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download holdings as CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^tonkfun-portfolio-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await download.path(), "utf8");
  expect(csv.split("\r\n")[0]).toBe('"Asset","Ticker","Network","Address","Holdings","Price USD","Value USD","24h change"');
  expect(csv).toContain('"Ethereum","ETH","Robinhood Chain","",0.42,3412,1433.04,2.8');
  expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
});

test("opens a position with its figures and where to take it", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  await holdings(page).getByRole("button", { name: "View Ghosty on Robinhood Chain" }).click();
  const dialog = page.getByRole("dialog", { name: "Your position." });
  await expect(dialog.getByRole("heading", { name: "Ghosty" })).toBeVisible();
  await expect(dialog).toContainText("Position value$5.82");
  await expect(dialog).toContainText("You hold100,000 GHOST");
  await expect(dialog).toContainText("24h market change+412.6%");
  await expect(dialog.getByRole("link", { name: "Swap this asset" })).toHaveAttribute("href", `/swap?chain=rh&from=0x5e1d7c4b92a03f6e18d5b7c2a94e6f01d3c8a0f3&to=${NATIVE_EVM}`);
  await expect(dialog.getByRole("link", { name: "View on explorer" })).toHaveAttribute("href", "https://robinhoodchain.blockscout.com/token/0x5e1d7c4b92a03f6e18d5b7c2a94e6f01d3c8a0f3");
  // Not one the live feed tracks, so no token page to send anyone to.
  await expect(dialog.getByRole("link", { name: "Open token details" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const row = holdings(page).locator("tbody tr").filter({ hasText: "Solana" });
  await expect(row.getByRole("link", { name: "Swap SOL on Solana" })).toHaveAttribute("href", `/swap?from=${SOL_MINT}&to=${USDC_MINT}`);
});

test("reads activity only when asked, merges the chains, filters and loads further back", async ({ page }) => {
  const asked = await stub(page);
  await connected(page);
  await open(page);
  expect(asked.activity).toBe(0);
  const panel = holdings(page);
  await panel.getByRole("tab", { name: "Activity" }).click();
  await expect(page).toHaveURL(/tab=activity/);
  const rows = panel.locator("ol li");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(/Swapped ETH for GHOST|Received USDC/);
  await expect(panel.getByText("Sent USDG")).toBeVisible();
  await expect(panel.getByText("−100 USDG")).toBeVisible();
  await expect(panel.getByText("To 0x93a1…7c2e")).toBeVisible();

  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByText("Received ORB")).toBeVisible();
  await expect(rows).toHaveCount(4);
  await expect(panel.getByRole("button", { name: "Load more" })).toHaveCount(0);

  await panel.getByLabel("Filter activity type").selectOption("swap");
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: "Activity details." });
  await expect(dialog.getByRole("heading", { name: "Swapped ETH for GHOST" })).toBeVisible();
  await expect(dialog).toContainText("+100,000 GHOST");
  await expect(dialog).toContainText("−0.0017 ETH");
  await expect(dialog.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", "https://robinhoodchain.blockscout.com/tx/0xswap");
});

test("Refresh reads the activity again too", async ({ page }) => {
  const asked = await stub(page);
  await connected(page);
  await open(page, "?tab=activity");
  await expect(holdings(page).locator("ol li")).toHaveCount(3);
  const before = asked.activity;
  await page.getByRole("button", { name: "Refresh balances" }).click();
  await expect.poll(() => asked.activity).toBeGreaterThan(before);
  await expect(holdings(page).locator("ol li")).toHaveCount(3);
});

test("shows the wallet's own address to receive on, with a warning about the network", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await stub(page);
  await connected(page);
  await open(page);
  await page.getByRole("complementary", { name: "Across your wallets" }).getByRole("button", { name: "Receive" }).click();
  const dialog = page.getByRole("dialog", { name: "Receive assets." });
  await expect(dialog.getByTestId("receive-address")).toHaveText(RH);
  await expect(dialog.getByText(/Send only Robinhood Chain assets/)).toBeVisible();
  await dialog.getByRole("button", { name: "Solana" }).click();
  await expect(dialog.getByTestId("receive-address")).toHaveText(SOL);
  await expect(dialog.getByText(/Send only Solana assets/)).toBeVisible();
  await dialog.getByRole("button", { name: "Copy address" }).click();
  await expect(dialog.getByRole("button", { name: "Address copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SOL);
});

test("with one wallet it offers the other network, and adds it in place", async ({ page }) => {
  await stub(page);
  await connected(page, ["rh"]);
  await open(page);
  await expect(total(page)).toHaveText("$2,691.78");
  const wallets = page.getByRole("complementary", { name: "Across your wallets" });
  await expect(wallets).toContainText("Not connected");
  await wallets.getByRole("button", { name: "Connect a Solana wallet" }).click();
  await expect(total(page)).toHaveText("$3,838.79");
  await wallets.getByRole("button", { name: "View your wallets" }).click();
  const dialog = page.getByRole("dialog", { name: "Your wallets." });
  await expect(dialog.getByRole("link", { name: "FLRe…SuCv" })).toHaveAttribute("href", `https://solscan.io/account/${SOL}`);
  await expect(dialog.getByRole("button", { name: "Copy Robinhood Chain wallet address" })).toBeVisible();
});

test("an empty wallet gets a fresh start, not an empty table", async ({ page }) => {
  await stub(page, { rh: portfolio("rh", RH, []), sol: portfolio("sol", SOL, []) });
  await connected(page);
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 2, name: "Your next chapter starts here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore tokens" })).toHaveAttribute("href", "/");
  await page.getByRole("button", { name: "Receive assets" }).click();
  await expect(page.getByRole("dialog", { name: "Receive assets." }).getByTestId("receive-address")).toHaveText(RH);
});

test("isn't called empty while the other network is still answering", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await stub(page, { rh: portfolio("rh", RH, []), sol: held.then(() => portfolio("sol", SOL, SOL_ASSETS)) });
  await connected(page);
  const answered = page.waitForResponse("**/api/portfolio/rh/**");
  await page.goto("/portfolio");
  await answered;
  await expect(page.getByRole("status", { name: "Loading your portfolio…" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your next chapter starts here." })).toHaveCount(0);
  release();
  await expect(total(page)).toHaveText("$1,147.01");
});

test("isn't called empty when the other network can't be read", async ({ page }) => {
  await stub(page, { rh: portfolio("rh", RH, []), sol: "fail" });
  await connected(page);
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 2, name: "Your balances couldn't be read." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your next chapter starts here." })).toHaveCount(0);
});

test("says when the networks can't be read, and tries again", async ({ page }) => {
  await stub(page, { rh: "fail", sol: "fail" });
  await connected(page);
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 2, name: "Your balances couldn't be read." })).toBeVisible();
  await page.unroute("**/api/portfolio/**");
  await stub(page);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(total(page)).toHaveText("$3,838.79");
});

test("one network failing leaves the other standing, and says the total may be low", async ({ page }) => {
  await stub(page, { sol: "fail" });
  await connected(page);
  await open(page);
  await expect(total(page)).toHaveText("$2,691.78");
  await expect(page.getByText("Some balances or prices couldn't be read just now, so totals may be low.")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Across your wallets" }).getByRole("button", { name: /Solana/ })).toContainText("Unavailable");
});

test("keeps tokens with no price out of the total, behind a warning", async ({ page }) => {
  await stub(page, { sol: portfolio("sol", SOL, [...SOL_ASSETS, SPAM], { unpriced: 1 }) });
  await connected(page);
  await open(page);
  await expect(total(page)).toHaveText("$3,838.79");
  const panel = holdings(page);
  await expect(panel.getByText("Claim at scam.example")).toHaveCount(0);
  await panel.getByRole("button", { name: "Show 1 tokens with no market price" }).click();
  await expect(panel.getByText("Claim at scam.example")).toBeVisible();
  await expect(panel.getByText(/Unknown tokens are often spam/)).toBeVisible();
  await expect(panel.getByRole("link", { name: /scam/ })).toHaveCount(0);
});

test("a long wallet opens with the first rows, then shows them all", async ({ page }) => {
  const many = Array.from({ length: 40 }, (_, i) => asset({ chain: "sol", address: `Mint${String(i).padStart(2, "0")}sampleSolanaTokenAddress11111111111`, symbol: `T${i}`, name: `Token ${i}`, balance: 100 - i, price: 1 }));
  await stub(page, { sol: portfolio("sol", SOL, many) });
  await connected(page, ["sol"]);
  await open(page);
  await expect(holdings(page).locator("tbody tr")).toHaveCount(30);
  await holdings(page).getByRole("button", { name: "Show all 40 assets" }).click();
  await expect(holdings(page).locator("tbody tr")).toHaveCount(40);
});

test("every control works from the keyboard and shows the focus ring", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  const ring = () => page.evaluate(() => { const style = getComputedStyle(document.activeElement as HTMLElement); return `${style.outlineWidth} ${style.outlineStyle}`; });
  await page.getByRole("group", { name: "Filter portfolio by network" }).getByRole("button", { name: "All networks" }).focus();
  const seen: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => { const el = document.activeElement as HTMLElement; return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""; });
    expect(await ring(), name).toBe("2px solid");
    seen.push(name);
  }
  expect(seen).toEqual(expect.arrayContaining(["Robinhood Chain", "Solana", "Refresh balances", "Hide portfolio balances", "Download holdings as CSV", "1W", "1Y"]));

  const tab = holdings(page).getByRole("tab", { name: /Assets/ });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(holdings(page).getByRole("tab", { name: "Activity" })).toBeFocused();
  await expect(page).toHaveURL(/tab=activity/);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  for (const [lang, theme, t] of [["de", "dark", de], ["ru", "light", ru]] as const) {
    test(`fits 390 px in ${lang}, ${theme}, and the quick actions replace the tab bar`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await stub(page);
      await connected(page);
      await page.goto(`/${lang}/portfolio`);
      await expect(total(page)).toHaveText("$3,838.79");
      expect(await fits(page), "the page").toBe(true);
      const dock = page.getByRole("navigation", { name: t.portfolio.dockLabel });
      await expect(dock.getByRole("button", { name: t.portfolio.wallets.receive })).toBeVisible();
      await expect(dock.getByRole("link", { name: t.portfolio.wallets.swap })).toBeVisible();
      await expect(page.getByRole("navigation", { name: t.nav.main })).toBeHidden();
      await page.screenshot({ path: `e2e/screenshots/portfolio-390-${lang}${theme === "light" ? "-light" : ""}.png` });

      await dock.getByRole("button", { name: t.portfolio.wallets.receive }).tap();
      const receive = page.getByRole("dialog", { name: t.portfolio.receive.title });
      await expect(receive).toBeVisible();
      expect(await fits(page), "the receive sheet").toBe(true);
      await receive.getByRole("button", { name: t.prefs.close }).tap();

      await page.getByRole("tab", { name: t.portfolio.tabs.activity }).tap();
      await expect(page.locator("ol li")).toHaveCount(3);
      expect(await fits(page), "the activity list").toBe(true);
    });
  }

  test("without a wallet the tab bar stays, so nobody is stranded", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { level: 2, name: "Connect to see your portfolio." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Portfolio quick actions" })).toHaveCount(0);
  });

  test("the way in fits 390 px in a long language", async ({ page }) => {
    await page.goto("/de/portfolio");
    await expect(page.getByRole("heading", { level: 2, name: de.portfolio.connect.title })).toBeVisible();
    expect(await fits(page)).toBe(true);
  });
});

test.describe("screenshots", () => {
  test.use({ reducedMotion: "reduce", timezoneId: "UTC" });
  for (const theme of ["dark", "light"] as const) {
    test(`portfolio at 1440 px, ${theme}`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await stub(page);
      await connected(page);
      await page.setViewportSize({ width: 1440, height: 1100 });
      await open(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/screenshots/portfolio-1440${theme === "light" ? "-light" : ""}.png`, fullPage: true });
    });
  }
});
