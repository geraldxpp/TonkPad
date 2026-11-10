import { expect, type Page, test } from "@playwright/test";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const OWNER = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";

/** 1 SOL = 86 USDC, less tonkfun.fun's 1%: lamports in, USDC base units out. */
function quoteFor(amount: string, tradingOpen: boolean) {
  const out = ((BigInt(amount) * BigInt(86)) / BigInt(1000)) * BigInt(99) / BigInt(100);
  return {
    chain: "sol", provider: "jupiter", inToken: SOL, outToken: USDC, inAmount: amount, outAmount: String(out), minOut: String((out * BigInt(99)) / BigInt(100)),
    slippageBps: 100, priceImpact: 0.0001, fee: { bps: 100, amount: String(BigInt(amount) / BigInt(100)), token: SOL }, networkFee: "5200",
    inUsd: (Number(amount) / 1e9) * 86, outUsd: Number(out) / 1e6, route: ["Raydium"], tradingOpen, quotedAt: Date.now(),
  };
}

/** The swap API and the wallet balances, answered in the browser: no provider is ever called. */
async function stubSwap(page: Page, { tradingOpen = true } = {}) {
  await page.route("**/api/swap/quote?**", (route) => route.fulfill({ json: quoteFor(new URL(route.request().url()).searchParams.get("amount") ?? "0", tradingOpen) }));
  await page.route("**/api/swap/build", (route) => {
    const body = route.request().postDataJSON() as { amount: string };
    return route.fulfill({ json: { quote: quoteFor(body.amount, true), solana: { transaction: Buffer.from("unsigned").toString("base64"), lastValidBlockHeight: 1 } } });
  });
  await page.route("**/api/swap/send", (route) => route.fulfill({ json: { signature: "5".repeat(88) } }));
  await page.route("**/api/swap/status?**", (route) => route.fulfill({ json: { state: "confirmed" } }));
  await page.route("**/api/wallet/sol/**", (route) => {
    const token = new URL(route.request().url()).searchParams.get("token");
    return route.fulfill({
      json: { chain: "sol", owner: OWNER, native: { raw: "2000000000", decimals: 9 }, token: token ? { address: token, amount: { raw: "0", decimals: 6 } } : null, readAt: Date.now() },
    });
  });
}

const card = (page: Page) => page.getByRole("region", { name: "Swap", exact: true });

async function openSwap(page: Page, path = "/swap") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("a live quote comes in as you type, with the fee, network cost and route", async ({ page }) => {
  await stubSwap(page);
  await openSwap(page);
  await expect(page.getByRole("heading", { level: 1, name: "Swap. Simple as that." })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Choose a token: SOL" })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Choose a token: USDC" })).toBeVisible();
  await card(page).getByLabel("You pay").fill("0.5");
  await expect(card(page).locator("output")).toHaveText("42.57");
  await expect(card(page).getByText("1 SOL = 85.14 USDC")).toBeVisible();
  await card(page).getByText("Quote details").click();
  await expect(card(page).getByText("0.005 SOL (1%)")).toBeVisible();
  await expect(card(page).getByText("Raydium", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Connect wallet" })).toBeVisible();
});

test("connect, review and swap with the wallet; Recent keeps the swap", async ({ page }) => {
  await stubSwap(page);
  await openSwap(page);
  await card(page).getByRole("button", { name: "Connect wallet" }).click();
  await expect(card(page).getByText("Balance 2", { exact: true })).toBeVisible();
  await card(page).getByLabel("You pay").fill("0.5");
  await card(page).getByRole("button", { name: "Review swap" }).click();
  const review = page.getByRole("dialog", { name: "One last look." });
  await expect(review.getByText("0.5 SOL")).toBeVisible();
  await expect(review.getByText("42.57 USDC")).toBeVisible();
  await review.getByRole("button", { name: "Confirm swap" }).click();
  await expect(review.getByText("Swap complete")).toBeVisible();
  await expect(review.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", `https://solscan.io/tx/${"5".repeat(88)}`);
  await review.getByRole("button", { name: "Done" }).click();
  await expect(card(page).getByLabel("You pay")).toHaveValue("");
  await card(page).getByRole("tab", { name: /Recent/ }).click();
  await expect(card(page).getByText("0.5 SOL → 42.57 USDC")).toBeVisible();
  await expect(card(page).getByText("Completed")).toBeVisible();
});

test("while the go-live switch is off, quotes work but swaps don't", async ({ page }) => {
  await stubSwap(page, { tradingOpen: false });
  await openSwap(page);
  await card(page).getByRole("button", { name: "Connect wallet" }).click();
  await card(page).getByLabel("You pay").fill("0.5");
  await expect(card(page).locator("output")).toHaveText("42.57");
  await expect(card(page).getByRole("button", { name: "Trading opens soon" })).toHaveAttribute("aria-disabled", "true");
});

test("a refusal in the wallet is explained, and the swap can be tried again", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tonkpad-wallet-stub-reject", "1"));
  await stubSwap(page);
  await openSwap(page);
  await card(page).getByRole("button", { name: "Connect wallet" }).click();
  await card(page).getByLabel("You pay").fill("0.5");
  await card(page).getByRole("button", { name: "Review swap" }).click();
  const review = page.getByRole("dialog", { name: "One last look." });
  await review.getByRole("button", { name: "Confirm swap" }).click();
  await expect(review.getByText("You cancelled it in your wallet.", { exact: false })).toBeVisible();
  await expect(review.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("the network and pair live in the URL; the picker finds tokens by name", async ({ page }) => {
  await stubSwap(page);
  await openSwap(page);
  await card(page).getByRole("button", { name: "Robinhood Chain" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("chain")).toBe("rh");
  await expect(card(page).getByRole("button", { name: "Choose a token: ETH" })).toBeVisible();
  await card(page).getByRole("button", { name: "Choose a token: USDG" }).click();
  const picker = page.getByRole("dialog", { name: "Choose a token to receive" });
  await picker.getByRole("searchbox").fill("wrapped");
  await picker.getByRole("listitem").getByRole("button", { name: /WETH/ }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("to")).toBe(WETH);
  await card(page).getByRole("button", { name: "Switch the tokens" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("from")).toBe(WETH);
  await page.reload();
  await expect(card(page).getByRole("button", { name: "Choose a token: WETH" })).toBeVisible();
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("no sideways scroll, and the estimate bar shows exactly while the card's button is off screen", async ({ page }) => {
    await stubSwap(page);
    await openSwap(page, "/de/swap");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await card(page).getByLabel("Du zahlst").fill("0.5");
    await expect(card(page).locator("output")).toHaveText("42.57");
    const button = card(page).getByRole("button", { name: "Wallet verbinden" });
    const bar = page.getByText("Erhältst ca.");
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await button.boundingBox();
    if (box && box.y > 844) await expect(bar).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await expect(bar).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 0));
    if (box && box.y > 844) await expect(page.getByText("≈ 42.57 USDC")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
