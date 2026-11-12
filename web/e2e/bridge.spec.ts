import { expect, type Page, test } from "@playwright/test";
import { de } from "../src/shared/i18n/dictionaries/de";
import { ru } from "../src/shared/i18n/dictionaries/ru";
import { STUB_ACCOUNTS, STUB_BRIDGE_SENT_KEY, STUB_EVM_HASH, STUB_REJECT_KEY, STUB_STORAGE_KEY } from "../src/shared/wallet/stub-driver";

// The screen is real; the wallet is the stub, and every /api/bridge call is answered here in the browser, so no test reaches a provider or moves anything.

const RH = STUB_ACCOUNTS.rh;
const SOL = STUB_ACCOUNTS.sol;
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const DEPOSITORY = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
const REQUEST_ID = `0x${"cd".repeat(32)}`;
const SIGNATURE = "5".repeat(88);

const route = (patch: Record<string, unknown>) => ({ id: "relay", provider: "relay", name: "Relay", outAmount: "249880000", minOut: "248630000", etaSeconds: 6, inUsd: 249.92, outUsd: 249.8, feeUsd: 0.11, networkUsd: 0.01, gasTopUp: null, trustless: false, ...patch });
const RELAY = route({});
const ACROSS = route({ id: "across", provider: "across", name: "Across", outAmount: "249840000", minOut: "249840000", etaSeconds: 7, outUsd: 249.76, feeUsd: 0.16 });

interface Stubs {
  routes?: unknown[];
  error?: string;
  tradingOpen?: boolean;
  balance?: string;
  coin?: string;
  /** The states the transfer goes through, one per status check; it stays on the last. */
  states?: string[];
  build?: Record<string, unknown>;
  buildError?: string;
}

/** Answers every bridge call; returns what was asked. */
async function stub(page: Page, { routes = [RELAY, ACROSS], error, tradingOpen = true, balance = "1250000000", coin = "500000000000000000", states = ["transit", "delivered"], build, buildError }: Stubs = {}) {
  const asked = { quotes: [] as URLSearchParams[], builds: [] as Record<string, unknown>[], sends: 0, status: 0 };
  await page.route("**/api/bridge/quote?**", (call) => {
    asked.quotes.push(new URL(call.request().url()).searchParams);
    return error ? call.fulfill({ status: 400, json: { error, tradingOpen } }) : call.fulfill({ json: { routes, tradingOpen, quotedAt: Date.now() } });
  });
  await page.route("**/api/bridge/build", (call) => {
    const body = call.request().postDataJSON() as Record<string, unknown>;
    asked.builds.push(body);
    if (buildError) return call.fulfill({ status: 409, json: { error: buildError } });
    const first = asked.builds.length === 1;
    return call.fulfill({
      json: {
        route: RELAY,
        approvals: first && !build ? [{ token: USDC_BASE, spender: DEPOSITORY, amount: body.amount }] : [],
        evm: { chainId: 8453, to: DEPOSITORY, data: "0xe8017952", value: "0", gas: "76194" },
        solana: null,
        tracking: { provider: "relay", requestId: REQUEST_ID, tool: null },
        ...build,
      },
    });
  });
  await page.route("**/api/bridge/tx?**", (call) => call.fulfill({ json: { state: "confirmed" } }));
  await page.route("**/api/bridge/send", (call) => {
    asked.sends += 1;
    return call.fulfill({ json: { signature: SIGNATURE } });
  });
  await page.route("**/api/bridge/status?**", (call) => {
    const state = states[Math.min(asked.status, states.length - 1)];
    asked.status += 1;
    return call.fulfill({ json: { state, destinationTx: state === "delivered" ? `0x${"f1".repeat(32)}` : null } });
  });
  await page.route("**/api/bridge/balance/**", (call) => {
    const url = new URL(call.request().url());
    const [, , , , network, owner] = url.pathname.split("/");
    const wants = url.searchParams.get("asset");
    return call.fulfill({ json: { network, owner, native: { raw: coin, decimals: 18 }, token: wants ? { raw: balance, decimals: 6 } : null, readAt: Date.now() } });
  });
  return asked;
}

const connected = (page: Page, chains: ("rh" | "sol")[] = ["rh", "sol"]) =>
  page.addInitScript(([key, saved]) => {
    localStorage.setItem("tonkpad-wallet", "1");
    localStorage.setItem(key, saved);
  }, [STUB_STORAGE_KEY, JSON.stringify({ active: chains[0], chains })] as const);

const card = (page: Page) => page.getByRole("region", { name: "Bridge workspace" });
const amount = (page: Page) => card(page).getByLabel("Amount to bridge");
const received = (page: Page) => card(page).getByRole("status", { name: "Estimated amount received" });
const routes = (page: Page) => page.getByRole("radiogroup", { name: "Pick your pace." });
const review = (page: Page) => page.getByRole("dialog", { name: "Check your destination." });
const progress = (page: Page) => page.getByRole("dialog", { name: "Your transfer" });

async function open(page: Page, search = "") {
  await page.goto(`/bridge${search}`);
  await expect(page.getByRole("heading", { level: 1, name: "Your assets. More places." })).toBeVisible();
}

async function typeAmount(page: Page, text = "250") {
  await amount(page).fill(text);
  await expect(routes(page).getByRole("radio").first()).toBeVisible();
}

test("compares live routes as you type, and shows what arrives", async ({ page }) => {
  await stub(page);
  await open(page);
  await expect(card(page).getByRole("button", { name: "Change source network, Base" })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Change destination network, Robinhood Chain" })).toBeVisible();
  await expect(page.getByText("Enter an amount to compare routes.")).toBeVisible();
  await typeAmount(page);
  await expect(received(page)).toHaveText("249.88");
  await expect(card(page).getByRole("button", { name: "Choose asset to receive, USDG" })).toBeVisible();
  await expect(routes(page).getByRole("radio")).toHaveCount(2);
  await expect(routes(page).getByText("Suggested")).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await card(page).getByText("Total fees").click();
  await expect(card(page).getByText("248.6")).toBeVisible();
});

test("picking a route changes the figures, and the URL can share it", async ({ page }) => {
  await stub(page);
  await open(page);
  await typeAmount(page);
  // Bound to the URL, so it settles a moment after the click.
  await routes(page).getByRole("radio").nth(1).click({ force: true });
  await expect(routes(page).getByRole("radio").nth(1)).toBeChecked();
  await expect(page).toHaveURL(/route=across/);
  await expect(received(page)).toHaveText("249.84");
  await page.reload();
  await expect(page).toHaveURL(/route=across/);
  await typeAmount(page);
  await expect(received(page)).toHaveText("249.84");
});

test("the network picker searches, and picking the other end turns the route around", async ({ page }) => {
  await stub(page);
  await open(page);
  await card(page).getByRole("button", { name: "Change source network, Base" }).click();
  const picker = page.getByRole("dialog", { name: "Choose where to send from" });
  await picker.getByRole("searchbox").fill("pol");
  await expect(picker.getByRole("button")).toHaveCount(2);
  await picker.getByRole("button", { name: /Polygon/ }).click();
  await expect(page).toHaveURL(/from=polygon/);
  await expect(card(page).getByRole("button", { name: "Change source network, Polygon" })).toBeVisible();

  await card(page).getByRole("button", { name: "Change source network, Polygon" }).click();
  await picker.getByRole("searchbox").fill("nothing-like-this");
  await expect(picker.getByText("No matching network. Try Base or Solana.")).toBeVisible();
  await picker.getByRole("searchbox").fill("robin");
  await picker.getByRole("button", { name: /Robinhood Chain/ }).click();
  await expect(page).toHaveURL(/from=rh/);
  await expect(page).toHaveURL(/to=polygon/);
});

test("reverses the route, and the asset goes with it", async ({ page }) => {
  await stub(page);
  await open(page);
  await card(page).getByRole("button", { name: "Reverse source and destination" }).click();
  await expect(card(page).getByRole("button", { name: "Change source network, Robinhood Chain" })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Change destination network, Base" })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Choose asset to send, USDG" })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Choose asset to receive, USDC" })).toBeVisible();
});

test("offers what each network really has: dollars arrive on Robinhood Chain as USDG", async ({ page }) => {
  await stub(page);
  await open(page);
  await card(page).getByRole("button", { name: "Choose asset to receive, USDG" }).click();
  const picker = page.getByRole("dialog", { name: "Choose what arrives" });
  await expect(picker.getByRole("button", { name: /USDC/ })).toHaveCount(0);
  await picker.getByRole("button", { name: /ETH/ }).click();
  await expect(page).toHaveURL(/receive=ETH/);
  await card(page).getByRole("button", { name: "Choose asset to send, USDC" }).click();
  await page.getByRole("dialog", { name: "Choose an asset" }).getByRole("button", { name: /ETH/ }).click();
  await expect(card(page).getByRole("button", { name: "Choose asset to send, ETH" })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Choose asset to receive, ETH" })).toBeVisible();
});

test("reads the wallet's balance, and Max keeps a reserve of the chain's coin", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  await expect(card(page).getByText("Balance 1,250")).toBeVisible();
  await card(page).getByRole("group", { name: "Percentage of source balance" }).getByRole("button", { name: "50%" }).click();
  await expect(amount(page)).toHaveValue("625");
  await card(page).getByRole("button", { name: "Choose asset to send, USDC" }).click();
  await page.getByRole("dialog", { name: "Choose an asset" }).getByRole("button", { name: /ETH/ }).click();
  await card(page).getByRole("group", { name: "Percentage of source balance" }).getByRole("button", { name: "Max" }).click();
  await expect(amount(page)).toHaveValue("0.4997");
});

test("says when the wallet is short, or has nothing to pay gas with", async ({ page }) => {
  await stub(page, { balance: "1000000" });
  await connected(page);
  await open(page);
  await expect(card(page).getByText("Balance 1", { exact: true })).toBeVisible();
  await amount(page).fill("250");
  await expect(card(page).getByRole("button", { name: "Not enough USDC" })).toBeVisible();
  await expect(card(page).getByRole("alert")).toHaveText("That's more USDC than this wallet holds on Base.");

  await page.unroute("**/api/bridge/balance/**");
  await stub(page, { coin: "0" });
  await page.reload();
  await amount(page).fill("250");
  await expect(card(page).getByRole("button", { name: "Keep some ETH for gas" })).toBeVisible();
});

test("runs a transfer end to end: approves exactly the amount, sends on the source network, follows it to arrival", async ({ page }) => {
  const asked = await stub(page);
  await connected(page);
  await open(page);
  await typeAmount(page);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  const dialog = review(page);
  await expect(dialog.getByText("250 USDC")).toBeVisible();
  await expect(dialog.getByText("249.88 USDG")).toBeVisible();
  await expect(dialog.getByTestId("bridge-review-recipient")).toHaveText(RH);
  await expect(dialog.getByText("Relay", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm transfer" }).click();

  await expect(progress(page).getByTestId("bridge-progress-title")).toHaveText("Arrived in your wallet", { timeout: 20_000 });
  await expect(progress(page).getByText("249.88 USDG")).toBeVisible();
  await expect(progress(page).getByRole("link", { name: "View on Base" })).toHaveAttribute("href", `https://basescan.org/tx/${STUB_EVM_HASH}`);
  await expect(progress(page).getByRole("link", { name: "View on Robinhood Chain" })).toHaveAttribute("href", `https://robinhoodchain.blockscout.com/tx/0x${"f1".repeat(32)}`);
  await expect(progress(page).getByRole("link", { name: "Explore Swap on arrival" })).toHaveAttribute("href", "/swap?chain=rh");

  // The approval comes first and is for exactly what's sent; the transfer is built again after it.
  expect(asked.builds).toHaveLength(2);
  expect(asked.builds[0]).toMatchObject({ from: "base", to: "rh", asset: "USDC", receive: "USDG", amount: "250000000", routeId: "relay", reviewedOut: "249880000", sender: RH, recipient: RH });
  const sent = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]") as { chainId: number; to: string; data: string }[], STUB_BRIDGE_SENT_KEY);
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatchObject({ chainId: 8453, to: USDC_BASE });
  expect(sent[0].data).toBe(`0x095ea7b3${DEPOSITORY.slice(2).padStart(64, "0")}${BigInt(250_000_000).toString(16).padStart(64, "0")}`);
  expect(sent[1]).toMatchObject({ chainId: 8453, to: DEPOSITORY, data: "0xe8017952" });

  // Recent keeps it, and a reload never sends it again.
  await page.keyboard.press("Escape");
  await page.reload();
  await card(page).getByRole("tab", { name: /Recent/ }).click();
  await expect(card(page).getByText("Base → Robinhood Chain")).toBeVisible();
  await expect(card(page).getByText("Arrived", { exact: true })).toBeVisible();
  const again = await page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[]).length, STUB_BRIDGE_SENT_KEY);
  expect(again).toBe(2);
});

test("a transfer in flight survives a reload and is followed from where it was", async ({ page }) => {
  await stub(page, { states: ["transit"], build: { approvals: [] } });
  await connected(page);
  await open(page);
  await typeAmount(page);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await review(page).getByRole("button", { name: "Confirm transfer" }).click();
  await expect(progress(page).getByTestId("bridge-progress-title")).toHaveText("Between networks", { timeout: 15_000 });
  await progress(page).getByRole("button", { name: "Close: it keeps going" }).click();
  await expect(page.getByRole("button", { name: /is on its way/ })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /is on its way/ }).click();
  await expect(progress(page).getByTestId("bridge-progress-title")).toHaveText("Between networks");
});

test("a Solana transfer is signed in the wallet and sent through the server", async ({ page }) => {
  const asked = await stub(page, { build: { approvals: [], evm: null, solana: { transaction: Buffer.from("unsigned").toString("base64") } }, states: ["delivered"] });
  await connected(page);
  await open(page, "?from=sol&to=rh&asset=USDC&receive=USDG");
  await typeAmount(page, "100");
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await review(page).getByRole("button", { name: "Confirm transfer" }).click();
  await expect(progress(page).getByTestId("bridge-progress-title")).toHaveText("Arrived in your wallet", { timeout: 15_000 });
  expect(asked.sends).toBe(1);
  expect(asked.builds[0]).toMatchObject({ sender: SOL, recipient: RH });
  await expect(progress(page).getByRole("link", { name: "View on Solana" })).toHaveAttribute("href", `https://solscan.io/tx/${SIGNATURE}`);
});

test("sends to another address only once it's valid for the destination, and warns before it goes", async ({ page }) => {
  const asked = await stub(page);
  await connected(page);
  await open(page);
  await typeAmount(page);
  await card(page).getByLabel("Use another address").check();
  await expect(card(page).getByRole("button", { name: "Enter a valid destination address" })).toBeVisible();
  const field = card(page).getByLabel("Receive on Robinhood Chain");
  await field.fill(SOL);
  await expect(card(page).getByRole("alert").filter({ hasText: "Enter a valid EVM address" })).toBeVisible();
  const other = "0x1111111111111111111111111111111111111111";
  await field.fill(other);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await expect(review(page).getByTestId("bridge-review-recipient")).toHaveText(other);
  await expect(review(page).getByText(/This isn't your connected wallet/)).toBeVisible();
  await expect.poll(() => asked.quotes.at(-1)?.get("recipient")).toBe(other);
});

test("asks for a wallet on the destination when only the source is connected", async ({ page }) => {
  await stub(page);
  await connected(page, ["sol"]);
  await open(page, "?from=sol&to=rh&asset=USDC&receive=USDG");
  await typeAmount(page, "100");
  await card(page).getByRole("button", { name: "Connect a wallet on Robinhood Chain to receive" }).click();
  await expect(card(page).getByRole("button", { name: "Review bridge" })).toBeVisible();
});

test("delivers gas with the transfer when asked, and not when the asset is the gas", async ({ page }) => {
  const asked = await stub(page);
  await connected(page);
  await open(page);
  await typeAmount(page);
  await card(page).getByRole("switch", { name: "Include gas on destination" }).check({ force: true });
  await expect.poll(() => asked.quotes.at(-1)?.get("gasTopUp")).toBe("1");
  await card(page).getByRole("button", { name: "Choose asset to receive, USDG" }).click();
  await page.getByRole("dialog", { name: "Choose what arrives" }).getByRole("button", { name: /ETH/ }).click();
  await expect(card(page).getByRole("switch", { name: "Include gas on destination" })).toBeDisabled();
  await expect(card(page).getByText(/You already receive ETH/)).toBeVisible();
});

test("stays shut until the switch is on, showing live quotes", async ({ page }) => {
  await stub(page, { tradingOpen: false });
  await connected(page);
  await open(page);
  await typeAmount(page);
  await expect(received(page)).toHaveText("249.88");
  await expect(card(page).getByRole("button", { name: "Bridging opens soon" })).toBeVisible();
  await expect(card(page).getByRole("alert")).toContainText("Real transfers aren't switched on yet");
});

test("explains why there's no route", async ({ page }) => {
  await stub(page, { error: "too-small" });
  await connected(page);
  await open(page);
  await amount(page).fill("0.001");
  await expect(card(page).getByRole("button", { name: "Amount too small" })).toBeVisible();
  await expect(card(page).getByRole("alert")).toContainText("doesn't cover the estimated fees");
});

test("a refusal in the wallet leaves nothing sent, and can be tried again", async ({ page }) => {
  await stub(page, { build: { approvals: [] } });
  await connected(page);
  await page.addInitScript((key) => localStorage.setItem(key, "1"), STUB_REJECT_KEY);
  await open(page);
  await typeAmount(page);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await review(page).getByRole("button", { name: "Confirm transfer" }).click();
  await expect(review(page).getByText("You cancelled it in your wallet. Nothing was sent.")).toBeVisible();
  await expect(review(page).getByRole("button", { name: "Try again" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tonkpad-bridge-recent"))).toBeNull();
});

test("asks again when the figures moved before it could be built", async ({ page }) => {
  await stub(page, { buildError: "price-moved" });
  await connected(page);
  await open(page);
  await typeAmount(page);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await review(page).getByRole("button", { name: "Confirm transfer" }).click();
  await expect(review(page).getByText(/The quote moved before it could be built/)).toBeVisible();
});

test("says so when a transfer comes back", async ({ page }) => {
  await stub(page, { build: { approvals: [] }, states: ["refunded"] });
  await connected(page);
  await open(page);
  await typeAmount(page);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await review(page).getByRole("button", { name: "Confirm transfer" }).click();
  await expect(progress(page).getByTestId("bridge-progress-title")).toHaveText("Sent back to you", { timeout: 15_000 });
  await expect(progress(page).getByText(/went back to your wallet on Base/)).toBeVisible();
});

test("a token page's link lands the coin there and leads back", async ({ page }) => {
  await stub(page, { build: { approvals: [] }, states: ["delivered"] });
  await connected(page);
  await open(page, "?to=rh&receive=ETH&return=/token/GHOST");
  await expect(card(page).getByRole("button", { name: "Choose asset to receive, ETH" })).toBeVisible();
  await typeAmount(page);
  await card(page).getByRole("button", { name: "Review bridge" }).click();
  await review(page).getByRole("button", { name: "Confirm transfer" }).click();
  await expect(progress(page).getByRole("link", { name: "Back to your token" })).toHaveAttribute("href", "/token/GHOST", { timeout: 15_000 });
});

test("ignores a return path that leaves the site", async ({ page }) => {
  await stub(page);
  await open(page, "?return=https://evil.example");
  await expect(page.getByRole("link", { name: "Explore Swap on arrival" })).toHaveAttribute("href", "/swap?chain=rh");
});

test("clearing history keeps anything still on its way", async ({ page }) => {
  await stub(page, { build: { approvals: [] }, states: ["transit"] });
  await connected(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("tonkpad-bridge-recent")) return;
    const base = { routeName: "Relay", sender: "0x3daa6db67596ce7633caa7ef42ca074a73db9490", recipient: "0x3daa6db67596ce7633caa7ef42ca074a73db9490", raw: "1", tracking: { provider: "relay", requestId: null, tool: null }, destinationTx: null, etaSeconds: 6, at: Date.now() };
    localStorage.setItem("tonkpad-bridge-recent", JSON.stringify([{ ...base, id: "done", from: { network: "base", symbol: "USDC", amount: "1" }, to: { network: "rh", symbol: "USDG", amount: "1" }, sourceTx: `0x${"aa".repeat(32)}`, state: "delivered" }, { ...base, id: "moving", from: { network: "arb", symbol: "ETH", amount: "1" }, to: { network: "rh", symbol: "ETH", amount: "1" }, sourceTx: `0x${"bb".repeat(32)}`, state: "transit" }]));
  });
  await open(page);
  await card(page).getByRole("tab", { name: /Recent/ }).click();
  await expect(card(page).locator("ol li")).toHaveCount(2);
  await card(page).getByRole("button", { name: "Clear history" }).click();
  await expect(card(page).locator("ol li")).toHaveCount(1);
  await expect(card(page).getByText("Arbitrum → Robinhood Chain")).toBeVisible();
});

test("every control works from the keyboard and shows the focus ring", async ({ page }) => {
  await stub(page);
  await connected(page);
  await open(page);
  await typeAmount(page);
  // The amount field wears the ring on its whole box.
  const ring = () => page.evaluate(() => { const active = document.activeElement as HTMLElement; const style = getComputedStyle(active.matches("input[inputmode=decimal]") ? (active.closest("[data-focus-field]") ?? active) : active); return `${style.outlineWidth} ${style.outlineStyle}`; });
  await card(page).getByRole("tab", { name: "Bridge", exact: true }).focus();
  const seen: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => { const el = document.activeElement as HTMLElement; return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""; });
    expect(await ring(), name).toBe("2px solid");
    seen.push(name);
  }
  expect(seen).toEqual(expect.arrayContaining(["How bridging works", "Change source network, Base", "Reverse source and destination", "Include gas on destination"]));
  const tab = card(page).getByRole("tab", { name: "Bridge", exact: true });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(card(page).getByRole("tab", { name: /Recent/ })).toBeFocused();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  for (const [lang, theme, t] of [["de", "dark", de], ["ru", "light", ru]] as const) {
    test(`fits 390 px in ${lang}, ${theme}, with the estimate and the button in reach`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await stub(page);
      await connected(page);
      await page.goto(`/${lang}/bridge`);
      await page.getByLabel(t.bridge.fields.amount).fill("250");
      await expect(page.getByRole("radiogroup", { name: t.bridge.routes.title }).getByRole("radio").first()).toBeVisible();
      expect(await fits(page), "the page").toBe(true);
      await page.screenshot({ path: `e2e/screenshots/bridge-390-${lang}${theme === "light" ? "-light" : ""}.png` });

      await page.getByRole("button", { name: t.bridge.action.review }).last().tap();
      const dialog = page.getByRole("dialog", { name: t.bridge.review.title });
      await expect(dialog).toBeVisible();
      expect(await fits(page), "the review").toBe(true);
      await dialog.getByRole("button", { name: t.prefs.close }).tap();

      await page.getByRole("button", { name: `${t.bridge.fields.changeFrom.replace("{name}", "Base")}` }).tap();
      await expect(page.getByRole("dialog", { name: t.bridge.networks.chooseFrom })).toBeVisible();
      expect(await fits(page), "the picker").toBe(true);
    });
  }
});

test.describe("the dialogs on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce", timezoneId: "UTC" });

  test("the review and the progress, as captures to hold against the design", async ({ page }) => {
    await stub(page, { build: { approvals: [] }, states: ["transit"] });
    await connected(page);
    await open(page);
    await typeAmount(page);
    await page.getByRole("button", { name: "Review bridge" }).last().tap();
    await expect(review(page)).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/screenshots/bridge-390-review.png" });
    await review(page).getByRole("button", { name: "Confirm transfer" }).tap();
    await expect(progress(page).getByTestId("bridge-progress-title")).toHaveText("Between networks", { timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/screenshots/bridge-390-progress.png" });
  });
});

test.describe("screenshots", () => {
  test.use({ reducedMotion: "reduce", timezoneId: "UTC" });
  for (const theme of ["dark", "light"] as const) {
    test(`bridge at 1440 px, ${theme}`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await stub(page);
      await connected(page);
      await page.setViewportSize({ width: 1440, height: 1150 });
      await open(page);
      await typeAmount(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/screenshots/bridge-1440${theme === "light" ? "-light" : ""}.png`, fullPage: true });
    });
  }
});
