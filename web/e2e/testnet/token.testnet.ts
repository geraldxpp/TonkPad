import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { de } from "../../src/shared/i18n/dictionaries/de";
import { ru } from "../../src/shared/i18n/dictionaries/ru";
import { STUB_EVM_HASH, STUB_STORAGE_KEY } from "../../src/shared/wallet/stub-driver";
import { DAY, GRAD, NEWB, OWNER, TOWN, TTONE } from "./fixture-chain";
import { STUB_WALLET } from "./fixtures";

// The testnet site's token page. The chain is the local stand-in (fixture-chain.ts holds its missions).
// It refuses to simulate or send, so what the server would build is answered here, in the browser,
// and the stub wallet "sends" it: no test reaches the real chain or signs anything.

const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
const PAD = "0xB9bb81242ce7B40775CEADF3b591411f0320Ec82";
const TX = { data: "0x", value: "0", gas: "300000" };
const tradePanel = (page: Page) => page.getByRole("region", { name: "Trade", exact: true });
const day = (seconds: number) => new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(seconds * 1000);

/** Opens the page with the stub wallet already connected on Robinhood Chain: a remembered session, restored on load. */
async function connected(page: Page): Promise<void> {
  await page.addInitScript(([key, value]) => {
    localStorage.setItem("tonkpad-wallet", "1");
    localStorage.setItem(key, value);
  }, [STUB_STORAGE_KEY, JSON.stringify({ active: "rh", chains: ["rh"] })] as const);
}

/** The mission as the page's own route reads it: the build routes hand it back beside their answer. */
async function missionOf(request: APIRequestContext, token: string) {
  const page = (await (await request.get(`/api/tonk/token/${token}`)).json()) as { mission: Record<string, unknown> };
  return page.mission;
}

/** Answers the transaction-status route: confirmed, having done `events()`. */
async function confirms(page: Page, events: () => unknown[]): Promise<void> {
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: null, events: events() } }));
}

/** Answers the action route with a transaction to `to`, keeping what the page asked for. */
async function buildsActions(page: Page, to: string): Promise<unknown[]> {
  const asked: unknown[] = [];
  await page.route("**/api/tonk/action", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { tx: { to, ...TX } } });
  });
  return asked;
}

const BUY_QUOTE = { side: "buy", amountIn: "50000000000000", out: "26119201142461485199930760", minOut: "25858009131036870347931452", protocolFee: "500000000000", crewFee: "1000000000000", creatorFee: "500000000000", refund: "0", completesCurve: false, capped: false };
const BOUGHT = { kind: "trade", token: TTONE.token, trader: STUB_WALLET, side: "buy", eth: "50000000000000", tokens: "26119201142461485199930760", protocolFee: "500000000000", crewFee: "1000000000000", creatorFee: "500000000000" };

test("the token page shows a mission's figures from the chain, in test ETH", async ({ page }) => {
  await page.goto(`/token/${TTONE.token}`);
  await expect(page).toHaveTitle("Tonk Test One — tonkfun.fun");
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
  const main = page.getByRole("main");
  // What the chain supports: the lock, the Crew fee and the launch-block shield every launch has.
  for (const mark of ["Locked Mission", "Crew Rewards 2%", "Block-0 Shield"]) await expect(main.getByText(mark, { exact: true }).first()).toBeVisible();
  await expect(main.getByRole("link", { name: "View token on the explorer" })).toHaveAttribute("href", `${EXPLORER}/address/${TTONE.token}`);

  // Price = vEth ÷ vTokens, cap = price × 1B, curve = (800M − left) ÷ 800M.
  await expect(main.getByText("0.0₁₁1787", { exact: true }).first()).toBeVisible();
  const stats = page.getByRole("region", { name: "Token stats" });
  await expect(stats).toContainText("Market cap0.001787test ETH");
  await expect(stats).toContainText("Liquidity0.000196test ETHin curve");
  await expect(stats).toContainText("Holders—Not on testnet yet");
  await expect(main.getByText("16%", { exact: true })).toBeVisible();

  // The launch buy, from its CurveTrade event; holders and top traders wait for the indexer.
  const activity = page.getByRole("region", { name: "Activity" });
  await expect(activity.getByRole("row").filter({ hasText: "0xd0d0…268f" })).toContainText("Buy");
  await expect(activity.getByRole("row").filter({ hasText: "0xd0d0…268f" })).toContainText("0.0002");
  await activity.getByRole("tab", { name: /^Holders/ }).click();
  await expect(activity.getByText("Not on testnet yet")).toBeVisible();
  await activity.getByRole("tab", { name: "Top traders" }).click();
  await expect(activity.getByText("Not on testnet yet")).toBeVisible();

  // The lock as the launchpad holds it, and the creator.
  const insights = page.getByRole("region", { name: "Token insights" });
  await expect(insights.getByText("Top 10 holders · Not on testnet yet")).toBeVisible();
  await expect(insights.getByText("0xd0d0…268f")).toBeVisible();
  await expect(insights.getByText("Linear vesting")).toBeVisible();
  await expect(insights.getByText(day(TTONE.lock[3]))).toBeVisible();
  await expect(insights.getByRole("link", { name: "Verify contract 0xB9bb…Ec82" })).toHaveAttribute("href", `${EXPLORER}/address/${PAD}`);

  // Crew Rewards paid so far; nothing of a wallet's until one is connected, and no creator's tools.
  const rewards = page.getByRole("region", { name: "Crew Rewards" });
  await expect(rewards.getByText("0.000003 test ETH")).toBeVisible();
  await expect(rewards.getByText("Connect a wallet to see your rewards.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Creator tools" })).toHaveCount(0);
  // Faucet ETH has no price: no figure on the page wears a dollar sign.
  expect(await main.innerText()).not.toMatch(/\$\s?\d/);
});

test("an address the launchpad doesn't know is not found, and so is anything that isn't an address", async ({ page }) => {
  for (const address of ["0x9999999999999999999999999999999999999999", "GHOST"]) {
    await page.goto(`/token/${address}`);
    await expect(page.getByText("This address isn't a token launched on tonkfun.fun here."), address).toBeVisible();
  }
});

test("a buy runs from the quote to its receipt, and a reload goes on watching it without sending again", async ({ page, request }) => {
  const mission = await missionOf(request, TTONE.token);
  const builds: unknown[] = [];
  await page.route("**/api/tonk/trade", (route) => {
    builds.push(route.request().postDataJSON());
    return route.fulfill({ json: { step: "trade", tx: { to: PAD, ...TX, value: "50000000000000" }, quote: BUY_QUOTE, mission } });
  });
  await confirms(page, () => [BOUGHT]);
  await connected(page);
  await page.goto(`/token/${TTONE.token}`);
  const panel = tradePanel(page);
  await expect(panel.getByText("Balance 0.5 test ETH")).toBeVisible();
  // The launchpad's presets: its virtual reserve ÷ 60, ÷ 24 and ÷ 12.
  await expect(panel.getByRole("button", { name: "0.0000625" })).toBeVisible();
  await panel.getByLabel("You pay").fill("0.00005");
  await expect(panel.getByText("26.12M", { exact: true })).toBeVisible();
  await expect(panel.getByText("Min. 25.86M TTONE at 1% slippage")).toBeVisible();
  await expect(panel.getByText("1% protocol · 2% Crew · 1% Creator")).toBeVisible();

  await panel.getByRole("button", { name: "Review buy" }).click();
  const review = page.getByRole("dialog", { name: "One last look." });
  await expect(review.getByText("0.00005 test ETH")).toBeVisible();
  await expect(review.getByText("26,119,201.14 $TTONE")).toBeVisible();
  await expect(review.getByText("25,858,009.13 $TTONE")).toBeVisible();
  await review.getByRole("button", { name: "Buy $TTONE" }).click();

  await expect(page).toHaveURL(new RegExp(`\\?tx=${STUB_EVM_HASH}$`));
  await expect(panel.getByText("Bought 26.12M $TTONE")).toBeVisible();
  await expect(panel.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", `${EXPLORER}/tx/${STUB_EVM_HASH}`);
  expect(builds).toEqual([{ token: TTONE.token, trader: STUB_WALLET, side: "buy", amount: "50000000000000", minOut: "25858009131036870347931452", referrer: null }]);

  await page.reload();
  await expect(panel.getByText("Bought 26.12M $TTONE")).toBeVisible();
  expect(builds).toHaveLength(1);
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(page).not.toHaveURL(/tx=/);
  await expect(panel.getByText("Bought 26.12M $TTONE")).toHaveCount(0);
});

test("a sell asks for an approval of exactly the amount first, then sells", async ({ page, request }) => {
  const mission = await missionOf(request, TTONE.token);
  const sale = { side: "sell", amountIn: "15000000000000000000000000", out: "25334400000000", minOut: "25081056000000", protocolFee: "263900000000", crewFee: "527800000000", creatorFee: "263900000000", refund: "0", completesCurve: false, capped: false };
  const builds: unknown[] = [];
  await page.route("**/api/tonk/trade", (route) => {
    builds.push(route.request().postDataJSON());
    // The launchpad may not take the tokens yet: an approval first, then the sale itself.
    const build = builds.length === 1 ? { step: "approve", tx: { to: TTONE.token, ...TX }, mission } : { step: "trade", tx: { to: PAD, ...TX }, quote: sale, mission };
    return route.fulfill({ json: build });
  });
  const sold = { kind: "trade", token: TTONE.token, trader: STUB_WALLET, side: "sell", eth: "26390000000000", tokens: sale.amountIn, protocolFee: sale.protocolFee, crewFee: sale.crewFee, creatorFee: sale.creatorFee };
  await confirms(page, () => [{ kind: "approved", token: TTONE.token, owner: STUB_WALLET, amount: sale.amountIn }, sold]);
  await connected(page);
  await page.goto(`/token/${TTONE.token}`);
  const panel = tradePanel(page);
  await panel.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(panel.getByText("Balance 30M TTONE")).toBeVisible();
  await panel.getByRole("button", { name: "50%" }).click();
  await expect(panel.getByLabel("You sell")).toHaveValue("15000000");

  await panel.getByRole("button", { name: "Review sell" }).click();
  const review = page.getByRole("dialog", { name: "One last look." });
  await expect(review.getByText("Two steps: approve exactly 15,000,000 $TTONE, then sell.")).toBeVisible();
  await review.getByRole("button", { name: "Sell $TTONE" }).click();

  // What the seller received: the event's gross ETH less its three fees.
  await expect(panel.getByText("Sold for 0.00002533 test ETH")).toBeVisible();
  const asked = { token: TTONE.token, trader: STUB_WALLET, side: "sell", amount: "15000000000000000000000000", referrer: null };
  expect(builds).toHaveLength(2);
  expect(builds[0]).toMatchObject(asked);
  expect(builds[0]).not.toHaveProperty("approval");
  // The same sale, built no earlier than the confirmed approval: the server is told which one it was.
  expect(builds[1]).toEqual({ ...(builds[0] as Record<string, unknown>), approval: STUB_EVM_HASH });
});

test("a holder claims unpaid Crew Rewards, and withdraws ETH the launchpad couldn't deliver", async ({ page, request }) => {
  const account = (await (await request.get(`/api/tonk/account?token=${TTONE.token}&owner=${STUB_WALLET}`)).json()) as Record<string, unknown>;
  expect(account).toMatchObject({ unpaidRewards: "1000000000000", unpaidEth: "0", isCreator: false });
  await page.route("**/api/tonk/account?**", (route) => route.fulfill({ json: { ...account, unpaidEth: "5000000000000" } }));
  const asked = await buildsActions(page, TTONE.token);
  let events: unknown[] = [{ kind: "rewards", token: TTONE.token, holder: STUB_WALLET, amount: "1000000000000" }];
  await confirms(page, () => events);
  await connected(page);
  await page.goto(`/token/${TTONE.token}`);

  const rewards = page.getByRole("region", { name: "Crew Rewards" });
  await expect(rewards.getByText("Your unpaid rewards")).toBeVisible();
  await rewards.getByRole("button", { name: "Claim 0.000001 test ETH" }).click();
  await expect(rewards.getByText("Claimed 0.000001 test ETH")).toBeVisible();
  await expect(rewards.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", `${EXPLORER}/tx/${STUB_EVM_HASH}`);

  events = [{ kind: "withdrawn", recipient: STUB_WALLET, amount: "5000000000000" }];
  const unpaid = page.getByRole("region", { name: "ETH waiting for you" });
  await expect(unpaid.getByText("The launchpad couldn't deliver 0.000005 test ETH to this wallet.")).toBeVisible();
  await unpaid.getByRole("button", { name: "Withdraw" }).click();
  await expect(unpaid.getByText("Withdrew 0.000005 test ETH")).toBeVisible();
  expect(asked).toEqual([
    { kind: "rewards", token: TTONE.token, owner: STUB_WALLET },
    { kind: "withdraw", owner: STUB_WALLET },
  ]);
});

test("the creator claims unlocked tokens, extends the lock and edits the details; no other wallet is offered it", async ({ page }) => {
  const asked = await buildsActions(page, PAD);
  let events: unknown[] = [{ kind: "claimed", token: TOWN.token, amount: "2500000000000000000000" }];
  await confirms(page, () => events);
  await connected(page);

  // The same wallet on someone else's mission: no creator's tools.
  await page.goto(`/token/${TTONE.token}`);
  await expect(tradePanel(page).getByText("Balance 0.5 test ETH")).toBeVisible();
  await expect(page.getByRole("region", { name: "Creator tools" })).toHaveCount(0);

  await page.goto(`/token/${TOWN.token}`);
  const tools = page.getByRole("region", { name: "Creator tools" });
  await expect(tools.getByText("Shown to your wallet only.")).toBeVisible();
  // A ten-year vest and a stored agent brief: the score and its marks hold still.
  await expect(page.getByRole("main").getByText("Agent", { exact: true })).toBeVisible();
  await expect(page.getByText("Mission score 80 / 100")).toBeAttached();
  await expect(tools.getByText(day(TOWN.lock[3])).first()).toBeVisible();

  await tools.getByRole("button", { name: /^Claim [\d.,]+[KM]? \$TOWN$/ }).click();
  await expect(tools.getByText("Claimed 2.5K $TOWN")).toBeVisible();

  events = [{ kind: "extended", token: TOWN.token, lockEnd: TOWN.lock[3] + 7 * DAY }];
  await tools.getByRole("button", { name: "Extend lock" }).click();
  const extend = page.getByRole("dialog", { name: "Extend your lock." });
  await expect(extend.getByText("A lock can be made longer, never shorter.")).toBeVisible();
  await expect(extend.getByText(/Your vest restarts/)).toBeVisible();
  await extend.getByRole("button", { name: "+7 days" }).click();
  await expect(extend.getByText(day(TOWN.lock[3] + 7 * DAY))).toBeVisible();
  await extend.getByRole("button", { name: "Extend by 7 days" }).click();
  await expect(extend.getByText(`Lock extended to ${day(TOWN.lock[3] + 7 * DAY)}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(extend).toBeHidden();

  events = [{ kind: "edited", token: TOWN.token }];
  await tools.getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name: "Edit your token's details." });
  // The form starts from what is on-chain.
  await expect(edit.getByLabel("Description")).toHaveValue("A town for stubs.");
  await expect(edit.getByLabel("X handle")).toHaveValue("stubtown");
  await expect(edit.getByLabel("Agent name")).toHaveValue("Mayor Stub");
  await edit.getByLabel("Website").fill("javascript:alert(1)");
  await expect(edit.getByRole("button", { name: "Save details" })).toBeDisabled();
  await edit.getByLabel("Website").fill("https://stub.town/");
  await edit.getByLabel("Description").fill("A bigger town.");
  await edit.getByRole("button", { name: "Save details" }).click();
  await expect(edit.getByText("Details saved")).toBeVisible();

  expect(asked).toEqual([
    { kind: "claim", token: TOWN.token, owner: STUB_WALLET },
    { kind: "extend", token: TOWN.token, owner: STUB_WALLET, days: 7 },
    { kind: "edit", token: TOWN.token, owner: STUB_WALLET, description: "A bigger town.", x: "stubtown", telegram: "", website: "https://stub.town/", agent: { name: "Mayor Stub", role: "Town crier", voice: "hype", brief: "Keep the town informed." } },
  ]);
});

test("the page says what stops a trade: graduated, the launch-block wait, a pause, an empty wallet", async ({ page, request }) => {
  await connected(page);
  // Graduated: curve trading is over, and the page says so in its marks too.
  await page.goto(`/token/${GRAD.token}`);
  await expect(page.getByRole("main").getByText("Graduated", { exact: true }).first()).toBeVisible();
  await tradePanel(page).getByLabel("You pay").fill("0.00005");
  await expect(tradePanel(page).getByRole("button", { name: "Graduated: pool trading comes later" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("region", { name: "Crew Rewards" })).toHaveCount(0);

  // Launched in the chain's current block: buys wait two blocks, sells don't.
  await page.goto(`/token/${NEWB.token}`);
  await tradePanel(page).getByLabel("You pay").fill("0.00005");
  await expect(tradePanel(page).getByRole("button", { name: "Trading opens in a moment" })).toHaveAttribute("aria-disabled", "true");
  await tradePanel(page).getByRole("button", { name: "Sell", exact: true }).click();
  await tradePanel(page).getByLabel("You sell").fill("1000");
  await expect(tradePanel(page).getByRole("button", { name: "Review sell" })).toBeVisible();
  // Eligible holders own less than the contract's floor (1% of supply), so it charges no Crew fee yet.
  await expect(tradePanel(page).getByText("1% protocol · 0.5% Creator · no Crew fee until eligible holders own 1% of the supply")).toBeVisible();

  // An empty wallet is pointed to the faucet.
  const account = (await (await request.get(`/api/tonk/account?token=${TTONE.token}&owner=${STUB_WALLET}`)).json()) as Record<string, unknown>;
  await page.route("**/api/tonk/account?**", (route) => route.fulfill({ json: { ...account, eth: "1000" } }));
  await page.goto(`/token/${TTONE.token}`);
  await tradePanel(page).getByLabel("You pay").fill("0.00005");
  await expect(tradePanel(page).getByRole("button", { name: "Not enough test ETH" })).toHaveAttribute("aria-disabled", "true");
  await expect(tradePanel(page).getByRole("link", { name: "Get test ETH" })).toHaveAttribute("href", "https://faucet.testnet.chain.robinhood.com");

  // The launchpad's owner pauses trading: the page's next read of the chain says so.
  await page.unroute("**/api/tonk/account?**");
  await page.route(`**/api/tonk/token/${TTONE.token}`, async (route) => {
    const read = (await (await route.fetch()).json()) as { mission: Record<string, unknown>; trades: unknown[] };
    return route.fulfill({ json: { ...read, mission: { ...read.mission, paused: true } } });
  });
  await expect(tradePanel(page).getByRole("button", { name: "Trading is paused" })).toHaveAttribute("aria-disabled", "true", { timeout: 15_000 });
});

test("the page keeps the last figures and says so when the chain can't be reached", async ({ page }) => {
  await page.goto(`/token/${TTONE.token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
  await page.route(`**/api/tonk/token/${TTONE.token}`, (route) => route.fulfill({ status: 502, json: { error: "unavailable" } }));
  await expect(page.getByText("The chain can't be reached right now. These are the last figures read.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
});

test("Explore on the testnet opens a token by its address, and lists the latest launches", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Not on testnet yet")).toBeVisible();
  const find = page.getByRole("region", { name: "Open a token" });
  await find.getByLabel("Token address").fill("0x12");
  await find.getByRole("button", { name: "Open", exact: true }).click();
  await expect(find.getByRole("alert")).toHaveText("Paste a token's address: 0x and 40 characters.");
  await find.getByLabel("Token address").fill(` ${TOWN.token} `);
  await find.getByLabel("Token address").press("Enter");
  await expect(page).toHaveURL(new RegExp(`/token/${TOWN.token}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Stub Town" })).toBeVisible();

  await page.goto("/");
  const latest = page.getByRole("region", { name: "Launched on testnet" });
  // Newest first, from the launchpad's MissionLaunched events.
  await expect(latest.getByRole("link")).toHaveText([/Newborn\s*NEWB/, /Graduate\s*GRAD/, /Stub Town\s*TOWN/, /Tonk Test One\s*TTONE/]);
  await latest.getByRole("link", { name: /Tonk Test One/ }).click();
  await expect(page).toHaveURL(new RegExp(`/token/${TTONE.token}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Tonk Test One" })).toBeVisible();
});

/** Where the keyboard is: the control's name and whether it shows the focus ring. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return { name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", ring: `${style.outlineWidth} ${style.outlineStyle}` };
  });

test("a buy works from the keyboard alone, and every stop shows the focus ring", async ({ page, request }) => {
  const mission = await missionOf(request, TTONE.token);
  await page.route("**/api/tonk/trade", (route) => route.fulfill({ json: { step: "trade", tx: { to: PAD, ...TX }, quote: BUY_QUOTE, mission } }));
  await confirms(page, () => [BOUGHT]);
  await connected(page);
  await page.goto(`/token/${TTONE.token}`);
  const panel = tradePanel(page);
  await expect(panel.getByText("Balance 0.5 test ETH")).toBeVisible();
  await panel.getByRole("button", { name: "Buy", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(panel.getByLabel("You pay")).toBeFocused();
  await page.keyboard.type("0.00005");
  // The presets, the slippage choices, then the button: each a stop with the ring.
  const stops: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await focused(page);
    expect(stop.ring, stop.name).toBe("2px solid");
    stops.push(stop.name);
    if (stop.name === "Review buy") break;
  }
  expect(stops).toEqual(["0.000025", "0.0000625", "0.000125", "Max", "0.5%", "1%", "3%", "Review buy"]);
  await page.keyboard.press("Enter");
  const review = page.getByRole("dialog", { name: "One last look." });
  await expect(review).toBeVisible();
  for (let i = 0; i < 4 && (await focused(page)).name !== "Buy $TTONE"; i += 1) await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ name: "Buy $TTONE", ring: "2px solid" });
  await page.keyboard.press("Enter");
  await expect(panel.getByText("Bought 26.12M $TTONE")).toBeVisible();
  await expect(review).toBeHidden();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  for (const [lang, theme, t] of [["de", "dark", de], ["ru", "light", ru]] as const) {
    test(`the creator's page fits 390 px in ${lang}, ${theme}, sheet and dialogs included`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await connected(page);
      await page.goto(`/${lang}/token/${TOWN.token}`);
      const tools = page.getByRole("region", { name: t.mission.creator.title });
      await expect(tools).toBeVisible();
      await expect(page.getByRole("region", { name: t.launch.economics.crewTitle })).toBeVisible();
      expect(await fits(page), "the page").toBe(true);
      await page.screenshot({ path: `e2e/screenshots/testnet/mission-390-${lang}.png` });

      await tools.getByRole("button", { name: t.mission.creator.extend }).tap();
      const extend = page.getByRole("dialog", { name: t.mission.creator.extendTitle });
      await expect(extend).toBeVisible();
      expect(await fits(page), "the Extend sheet").toBe(true);
      await page.screenshot({ path: `e2e/screenshots/testnet/mission-390-${lang}-extend.png` });
      await extend.getByRole("button", { name: t.prefs.close }).tap();

      await tools.getByRole("button", { name: t.mission.creator.edit }).tap();
      await expect(page.getByRole("dialog", { name: t.mission.creator.editTitle })).toBeVisible();
      expect(await fits(page), "the Edit sheet").toBe(true);
      await page.getByRole("dialog", { name: t.mission.creator.editTitle }).getByRole("button", { name: t.prefs.close }).tap();

      // The Buy / Sell bar takes the tab bar's place; Buy opens the trade form in a sheet.
      await page.getByRole("button", { name: t.token.trade.buy, exact: true }).tap();
      const sheet = page.getByRole("dialog").filter({ has: page.getByLabel(t.token.trade.pay) });
      await sheet.getByLabel(t.token.trade.pay).fill("0.00005");
      await expect(sheet.getByRole("button", { name: t.mission.trade.reviewBuy })).toBeVisible();
      expect(await fits(page), "the trade sheet").toBe(true);
      await page.screenshot({ path: `e2e/screenshots/testnet/mission-390-${lang}-trade.png` });
    });
  }

  test("a trade sent from the sheet shows above the Buy / Sell bar until it is dismissed", async ({ page, request }) => {
    const mission = await missionOf(request, TTONE.token);
    await page.route("**/api/tonk/trade", (route) => route.fulfill({ json: { step: "trade", tx: { to: PAD, ...TX }, quote: BUY_QUOTE, mission } }));
    await confirms(page, () => [BOUGHT]);
    await connected(page);
    await page.goto(`/token/${TTONE.token}`);
    const bar = page.getByRole("region", { name: "Trade Tonk Test One" });
    await bar.getByRole("button", { name: "Buy", exact: true }).tap();
    const sheet = page.getByRole("dialog", { name: "Trade Tonk Test One" });
    await expect(sheet.getByText("Balance 0.5 test ETH")).toBeVisible();
    await sheet.getByLabel("You pay").fill("0.00005");
    await sheet.getByRole("button", { name: "Review buy" }).tap();
    await page.getByRole("dialog", { name: "One last look." }).getByRole("button", { name: "Buy $TTONE" }).tap();
    // Sent: the sheet closes, and the bar carries the trade to its receipt.
    await expect(sheet).toBeHidden();
    await expect(bar.getByText("Bought 26.12M $TTONE")).toBeVisible();
    expect(await fits(page)).toBe(true);
    await bar.getByRole("button", { name: "Done" }).tap();
    await expect(bar.getByText("Bought 26.12M $TTONE")).toHaveCount(0);
  });
});

// These captures show the moment of the run (ages, what has unlocked), so they change every time: e2e/screenshots/testnet/ is not committed.
test.describe("screenshots", () => {
  test.use({ reducedMotion: "reduce", timezoneId: "UTC" });
  for (const theme of ["dark", "light"] as const) {
    test(`the creator's token page at 1440 px, ${theme}`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await connected(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/token/${TOWN.token}`);
      await expect(page.getByRole("region", { name: "Creator tools" })).toBeVisible();
      await page.locator("canvas").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/screenshots/testnet/mission-1440${theme === "light" ? "-light" : ""}.png`, fullPage: true });
    });
  }
});

test("the owner's wallet is the creator of the fixture's first mission, as on the real chain", async ({ request }) => {
  const account = (await (await request.get(`/api/tonk/account?token=${TTONE.token}&owner=${OWNER}`)).json()) as Record<string, unknown>;
  expect(account).toMatchObject({ isCreator: true, tokens: TTONE.creatorHeld, eth: "0" });
  // The routes check what they are given, and an unknown token is "missing", never a guess.
  for (const [path, status, error] of [
    ["/api/tonk/token/0x12", 400, "invalid"],
    ["/api/tonk/token/0x9999999999999999999999999999999999999999", 404, "missing"],
    [`/api/tonk/account?token=${TTONE.token}&owner=me`, 400, "invalid"],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(status);
    expect(await response.json(), path).toEqual({ error });
  }
  const trade = await request.post("/api/tonk/trade", { data: { token: TTONE.token, trader: STUB_WALLET, side: "buy", amount: "0", minOut: "1", referrer: null } });
  expect([trade.status(), await trade.json()]).toEqual([400, { error: "invalid" }]);
  // The stand-in chain refuses to simulate: a real build never comes out of this suite.
  const build = await request.post("/api/tonk/trade", { data: { token: TTONE.token, trader: STUB_WALLET, side: "buy", amount: "50000000000000", minOut: "1", referrer: null } });
  expect(build.ok()).toBe(false);
  const action = await request.post("/api/tonk/action", { data: { kind: "extend", token: TOWN.token, owner: STUB_WALLET, days: 6 } });
  expect([action.status(), await action.json()]).toEqual([400, { error: "invalid" }]);
});
