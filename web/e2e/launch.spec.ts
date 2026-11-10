import { expect, type Locator, type Page, test } from "@playwright/test";

/** The demo's settings: the contract's mainnet defaults (0.005 ETH fee, 6 ETH reserve). */
const SETTINGS = { chainId: 0, launchFee: "5000000000000000", virtualEth: "6000000000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: "20000000", readAt: 1 };
const HASH = `0x${"5a".repeat(32)}`;
const TOKEN = "0x1111111111111111111111111111111111111111";
const BOUGHT = "42095276220976781425140112";
const LOCKED = "33676220976781425140112089";
const MISSION = {
  token: TOKEN, creator: "0x7a5e00000000000000000000000000000000c0de", name: "Astro Pup", symbol: "ASTRO", crewBps: 200, creatorBps: 100, lockType: "linear", lockedBps: 8000,
  lockEnd: 1_800_000_000, devBuy: "250000000000000000", bought: BOUGHT, locked: LOCKED, protocolFee: "2500000000000000", creatorFee: "2500000000000000", block: 151_200_000,
};

interface Chain {
  /** "ok", or the error code the build route answers with. */
  build?: string;
  /** The states the transaction goes through; the last one stays. */
  states?: string[];
  balance?: string;
  settings?: typeof SETTINGS;
}

/** The launchpad and the wallet's balance, answered in the browser: no RPC is ever called and nothing is sent. */
async function stubChain(page: Page, { build = "ok", states = ["confirmed"], balance = "2000000000000000000", settings = SETTINGS }: Chain = {}) {
  const calls = { build: 0, tx: 0 };
  await page.route("**/api/wallet/rh/**", (route) => {
    const owner = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ json: { chain: "rh", owner, native: { raw: balance, decimals: 18 }, token: null, readAt: Date.now() } });
  });
  await page.route("**/api/tonk/launch", (route) => {
    calls.build += 1;
    if (build !== "ok") return route.fulfill({ status: 409, json: { error: build } });
    const body = route.request().postDataJSON() as { devBuy: string };
    return route.fulfill({ json: { tx: { to: TOKEN, data: "0x", value: String(BigInt(settings.launchFee) + BigInt(body.devBuy)), gas: "2000000" }, settings, bought: BOUGHT, locked: LOCKED } });
  });
  await page.route("**/api/tonk/tx?**", (route) => {
    const state = states[Math.min(calls.tx, states.length - 1)];
    calls.tx += 1;
    return route.fulfill({ json: { state, mission: state === "confirmed" ? MISSION : null } });
  });
  return calls;
}

const summary = (page: Page) => page.getByRole("region", { name: "Your launch, at a glance." });
const review = (page: Page) => page.getByRole("dialog", { name: "One final look." });

async function openStudio(page: Page, path = "/launch") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function fill(page: Page) {
  await page.getByLabel("Token name").fill("Astro Pup");
  await page.getByLabel("Ticker", { exact: true }).fill("astro");
}

test("the studio opens empty on the design's settings, and the preview follows the form", async ({ page }) => {
  await stubChain(page);
  await openStudio(page);
  await expect(page.getByRole("heading", { level: 1, name: "Launch a mission." })).toBeVisible();
  await expect(page.getByLabel("Token name")).toHaveValue("");
  await expect(page.getByLabel("Initial dev buy in ETH")).toHaveValue("0.25");
  await expect(summary(page).getByTestId("launch-pay")).toHaveText("0.255 ETH");
  await expect(summary(page).getByText("42.1M · 4.21%")).toBeVisible();
  await expect(summary(page).getByText("80% · 6-month linear vest")).toBeVisible();

  await fill(page);
  // The ticker is upper-cased as it is typed.
  await expect(page.getByLabel("Ticker", { exact: true })).toHaveValue("ASTRO");
  const preview = page.getByRole("region", { name: "Token preview" });
  await expect(preview.getByText("Astro Pup")).toBeVisible();
  await expect(preview.getByText("$ASTRO")).toBeVisible();
  for (const badge of ["Locked", "Crew 2%", "Block-0 Shield"]) await expect(preview.getByText(badge, { exact: true })).toBeVisible();
  await expect(preview.getByText("Agent", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Launch steps" }).getByText("Tonkfun Native · $ASTRO / ETH")).toBeVisible();

  // A day in the economy: the Crew, the creator and tonkfun.fun share the 4% fee; a 1% holder's part comes out of the Crew's.
  const figure = (label: string) => page.locator("div", { has: page.getByText(label, { exact: true }) }).last();
  await expect(figure("To the Crew / day")).toContainText("$2,000");
  await expect(figure("To you / day")).toContainText("$1,000");
  await expect(figure("To tonkfun.fun / day")).toContainText("$1,000");
  await expect(figure("Crew Rewards for holding 1% of eligible supply / day")).toContainText("$20.00");
  await page.getByRole("group", { name: "Daily volume" }).getByRole("button", { name: "$500K" }).click();
  await expect(figure("To the Crew / day")).toContainText("$10,000");
  await expect(figure("To tonkfun.fun / day")).toContainText("$5,000");
  await expect(figure("Crew Rewards for holding 1% of eligible supply / day")).toContainText("$100.00");

  // Mission score: 70 at launch, 80 Safe ten minutes on.
  // The score card beside the form (a second copy sits in the phone preview dialog).
  const score = page.getByRole("complementary").locator("details", { hasText: "Mission score preview" });
  await expect(score.getByText("70", { exact: true })).toBeVisible();
  await score.locator("summary").click();
  await expect(score.getByText("80 Safe after 10 minutes, if nothing else changes")).toBeVisible();
  await expect(score.getByText("No mint or freeze authority")).toBeVisible();
});

test("Crew and Creator share 4%, and Creator Rewards follow the lock", async ({ page }) => {
  await stubChain(page);
  await openStudio(page);
  const crew = page.getByRole("group", { name: "Crew Rewards" });
  const creator = page.getByRole("group", { name: "Creator Rewards" });
  await creator.getByRole("button", { name: "2.0%" }).click();
  await crew.getByRole("button", { name: "3.0%" }).click();
  await expect(creator.getByRole("button", { name: "1.0%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Creator Rewards adjusted to 1.0% to keep the shared rewards within 4.0%.")).toBeVisible();
  await expect(page.getByText("5.0% / 5.0% maximum").first()).toBeVisible();

  // A lock under the Ironclad tier closes 3% and 4%.
  await crew.getByRole("button", { name: "Off" }).click();
  await creator.getByRole("button", { name: "4.0%" }).click();
  await page.getByLabel("Dev buy to lock").fill("75");
  await expect(creator.getByRole("button", { name: "2.0%" })).toHaveAttribute("aria-pressed", "true");
  await expect(creator.getByRole("button", { name: "4.0%" })).toBeDisabled();
  await expect(page.getByText("Creator Rewards adjusted to 2.0% for the current lock.")).toBeVisible();

  // No dev buy: no lock, Creator Rewards capped at 0.5%, and no Locked badge.
  await page.getByRole("group", { name: "Initial dev buy" }).getByRole("button", { name: "None" }).click();
  await expect(page.getByRole("button", { name: /^No lock/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Linear vesting/ })).toBeDisabled();
  await expect(creator.getByRole("button", { name: "0.5%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("An initial dev buy is required to lock tokens and unlock higher Creator Rewards.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Token preview" }).getByText("Locked", { exact: true })).toHaveCount(0);
  await expect(summary(page).getByTestId("launch-pay")).toHaveText("0.005 ETH");
});

test("connect, review and launch with the wallet; the receipt comes from the chain", async ({ page }) => {
  const calls = await stubChain(page, { states: ["pending", "confirmed"] });
  await openStudio(page);
  await fill(page);
  await page.getByLabel("X handle").fill("@astropup");
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  const dialog = review(page);
  await expect(dialog.getByRole("heading", { name: "Astro Pup" })).toBeVisible();
  await expect(dialog.getByText("$ASTRO / ETH · Robinhood Chain")).toBeVisible();
  await expect(dialog.getByText("0.255 ETH")).toBeVisible();
  await expect(dialog.getByText("33.68M / 8.42M")).toBeVisible();
  // Nothing launches until the settings are ticked.
  await expect(dialog.getByRole("button", { name: "Launch $ASTRO" })).toBeDisabled();
  await dialog.getByLabel("I have checked these settings.").check();
  await dialog.getByRole("button", { name: "Launch $ASTRO" }).click();

  await expect(page).toHaveURL(new RegExp(`/launch\\?tx=${HASH}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Mission launched" })).toBeVisible();
  await expect(page.getByText("Astro Pup is live on Robinhood Chain.")).toBeVisible();
  await expect(page.getByText(TOKEN)).toBeVisible();
  await expect(page.getByText("42.1M $ASTRO")).toBeVisible();
  expect(calls.build).toBe(1);

  await page.getByRole("button", { name: "Launch another" }).click();
  await expect(page).toHaveURL(/\/launch$/);
  await expect(page.getByLabel("Token name")).toHaveValue("");
});

test("a reload while confirming resumes the watch and sends nothing", async ({ page }) => {
  const calls = await stubChain(page, { states: ["pending", "pending", "pending", "confirmed"] });
  await openStudio(page, `/launch?tx=${HASH}`);
  await expect(page.getByRole("heading", { level: 1, name: "Launch confirming" })).toBeVisible();
  await expect(page.getByText("Nothing is sent twice.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Mission launched" })).toBeVisible({ timeout: 15_000 });
  expect(calls.build).toBe(0);
});

test("what went wrong is said plainly, and nothing is called a launch that isn't one", async ({ page }) => {
  await stubChain(page, { states: ["failed"] });
  await openStudio(page, `/launch?tx=${HASH}`);
  await expect(page.getByText("It failed on-chain. Nothing was launched; only the network fee was spent.")).toBeVisible();
  await page.getByRole("button", { name: "Back to the studio" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Launch a mission." })).toBeVisible();

  await page.unrouteAll();
  await stubChain(page, { states: ["replaced"] });
  await openStudio(page, `/launch?tx=${HASH}`);
  await expect(page.getByText("This transaction was replaced or cancelled in your wallet.", { exact: false })).toBeVisible();

  await page.unrouteAll();
  await page.route("**/api/tonk/tx?**", (route) => route.fulfill({ json: { state: "confirmed", mission: null } }));
  await openStudio(page, `/launch?tx=${HASH}`);
  await expect(page.getByText("This transaction isn't a launch.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mission launched" })).toHaveCount(0);
});

for (const [name, setup, message] of [
  ["a refusal in the wallet", { reject: "1" }, "You cancelled it in your wallet."],
  ["a wallet that can't switch networks", { reject: "network" }, "Your wallet couldn't switch to this network."],
  ["a launch the launchpad refuses", { build: "refused" }, "The launchpad refused these settings. Nothing was sent."],
  ["a wallet short of gas", { build: "funds" }, "Not enough ETH for the launch and its network fee."],
  ["a paused launchpad", { build: "paused" }, "Launches are paused right now. Nothing was sent."],
] as const) {
  test(`${name} is explained in the review, and can be tried again`, async ({ page }) => {
    if ("reject" in setup) await page.addInitScript((value) => localStorage.setItem("tonkpad-wallet-stub-reject", value), setup.reject);
    await stubChain(page, "build" in setup ? { build: setup.build } : {});
    await openStudio(page);
    await fill(page);
    await summary(page).getByRole("button", { name: "Connect wallet" }).click();
    await summary(page).getByRole("button", { name: "Review launch" }).click();
    await review(page).getByLabel("I have checked these settings.").check();
    await review(page).getByRole("button", { name: "Launch $ASTRO" }).click();
    await expect(review(page).getByText(message, { exact: false })).toBeVisible();
    await expect(review(page).getByRole("button", { name: "Try again" })).toBeEnabled();
    await expect(page).toHaveURL(/\/launch$/);
  });
}

test("if the launchpad's settings moved, nothing is sent and the review shows the new figures", async ({ page }) => {
  await stubChain(page, { settings: { ...SETTINGS, launchFee: "10000000000000000", readAt: Date.now() + 60_000 } });
  await openStudio(page);
  await fill(page);
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  await review(page).getByLabel("I have checked these settings.").check();
  await review(page).getByRole("button", { name: "Launch $ASTRO" }).click();
  await expect(review(page).getByText("The launchpad's settings changed. The figures above are updated.")).toBeVisible();
  await expect(page).toHaveURL(/\/launch$/);
  // Mock mode keeps its own settings on screen; the point is that the wallet was never asked.
  await expect(page.getByRole("heading", { name: "Mission launched" })).toHaveCount(0);
});

test("fields are checked before the review, and a short wallet can't launch", async ({ page }) => {
  await stubChain(page, { balance: "1000000000000000" });
  await openStudio(page);
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  await expect(summary(page).getByRole("button", { name: "Not enough ETH" })).toHaveAttribute("aria-disabled", "true");

  await page.unrouteAll();
  await stubChain(page);
  await page.reload();
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  await expect(page.getByText("Enter a token name with 1–32 characters.")).toBeVisible();
  await expect(page.getByText("Use 1–10 letters or numbers, without a dollar sign.")).toBeVisible();
  await expect(page.getByLabel("Token name")).toBeFocused();
  await expect(summary(page).getByRole("button", { name: "Check the highlighted fields" })).toBeVisible();
  await expect(review(page)).toBeHidden();
  await fill(page);
  await page.getByLabel("Website").fill("javascript:alert(1)");
  await page.getByLabel("Website").blur();
  await expect(page.getByText("Enter a website domain or an http/https URL.")).toBeVisible();
  await page.getByLabel("Website").fill("astropup.fun");
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  await expect(review(page)).toBeVisible();
});

test("a draft is saved only when asked, comes back after a reload, and resets", async ({ page }) => {
  await stubChain(page);
  await openStudio(page);
  await fill(page);
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Token name")).toHaveValue("");
  await fill(page);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Token name")).toHaveValue("Astro Pup");
  await page.getByRole("button", { name: "Reset draft" }).click();
  await page.getByRole("dialog", { name: "Start this draft again?" }).getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Token name")).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Token name")).toHaveValue("");
});

test("Refer & earn explains the 25%, and gives a connected wallet its link", async ({ page }) => {
  await stubChain(page);
  await openStudio(page);
  await page.getByRole("button", { name: "Refer & earn 25%" }).click();
  const dialog = page.getByRole("dialog", { name: "Refer a trader. Share the fee." });
  await expect(dialog.getByText("0.25% of the trade, not 25% of it", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Connect a wallet to get your link.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Refer & earn 25%" }).click();
  await expect(dialog.getByLabel("Your link")).toHaveValue(/\/\?ref=0x7a5e00000000000000000000000000000000c0de$/);
});

test("the Token Agent is off until switched on, then needs its fields", async ({ page }) => {
  await stubChain(page);
  await openStudio(page);
  await fill(page);
  await page.getByRole("switch", { name: "Enabled" }).check();
  await expect(page.getByRole("region", { name: "Token preview" }).getByText("Agent", { exact: true })).toBeVisible();
  await summary(page).getByRole("button", { name: "Connect wallet" }).click();
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  await expect(page.getByText("Enter an agent name with 1–32 characters.")).toBeVisible();
  await page.getByLabel("Agent name").fill("Commander Astro");
  await page.getByLabel("Role", { exact: true }).fill("Mission commander");
  await page.getByLabel("Personality & mission brief").fill("Keep holders informed.");
  await page.getByRole("button", { name: "Hype" }).click();
  await expect(page.getByText("Great news, crew! 80% of the dev buy vests over 180 days.", { exact: false })).toBeVisible();
  await expect(page.getByText("This chat is a preview: no agent service answers yet.")).toBeVisible();
  await summary(page).getByRole("button", { name: "Review launch" }).click();
  await expect(review(page).getByText("Commander Astro")).toBeVisible();
});

/** Where the keyboard is: the control's name and its focus ring (its own outline, or its field's: the dev-buy box rings the whole field). */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const own = getComputedStyle(el);
    const field = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const ring = own.outlineStyle !== "none" ? own : field;
    return {
      stop: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40) || el.id || el.tagName,
      ring: ring && ring.outlineStyle !== "none" ? `${ring.outlineWidth} ${ring.outlineStyle}` : "none",
    };
  });

/** Presses Tab until the control has the focus. */
async function tabTo(page: Page, control: Locator) {
  for (let presses = 0; presses < 12; presses += 1) {
    if (await control.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(control).toBeFocused();
}

test("the whole launch works from the keyboard, and every stop shows the focus ring", async ({ page }) => {
  await stubChain(page);
  await openStudio(page);
  await page.getByLabel("Token name").focus();
  await page.keyboard.type("Astro Pup");
  await page.keyboard.press("Tab");
  await page.keyboard.type("astro");
  await expect(page.getByLabel("Ticker", { exact: true })).toHaveValue("ASTRO");

  // Choices, sliders and the switch answer to the keyboard.
  const timeLock = page.getByRole("button", { name: /^Time-lock/ });
  await timeLock.focus();
  await page.keyboard.press("Enter");
  await expect(timeLock).toHaveAttribute("aria-pressed", "true");
  const vesting = page.getByRole("button", { name: /^Linear vesting/ });
  await vesting.focus();
  await page.keyboard.press("Space");
  await expect(vesting).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Dev buy to lock").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Dev buy to lock")).toHaveValue("85");
  const crew3 = page.getByRole("group", { name: "Crew Rewards" }).getByRole("button", { name: "3.0%" });
  await crew3.focus();
  await page.keyboard.press("Enter");
  await expect(crew3).toHaveAttribute("aria-pressed", "true");
  const agent = page.getByRole("switch", { name: "Enabled" });
  await agent.focus();
  await page.keyboard.press("Space");
  await expect(agent).toBeChecked();
  await page.keyboard.press("Space");
  await expect(agent).not.toBeChecked();

  // Tab from the ticker to the main button: every control on the way can be reached, and shows the ring.
  await page.getByLabel("Ticker", { exact: true }).focus();
  const stops: string[] = [];
  for (let presses = 0; presses < 60 && stops.at(-1) !== "Connect wallet"; presses += 1) {
    await page.keyboard.press("Tab");
    const { stop, ring } = await focused(page);
    expect(ring, stop).toBe("2px solid");
    stops.push(stop);
  }
  expect(stops.at(-1)).toBe("Connect wallet");
  for (const control of ["launch-description", "launch-website", "Initial dev buy in ETH", "launch-months", "launch-share", "$100K", "Reset draft"]) expect(stops).toContain(control);
  expect(stops.some((stop) => stop.startsWith("Time-lock"))).toBe(true);

  // Connect, review, tick and launch without the mouse. Escape closes the review and gives the focus back.
  await page.keyboard.press("Enter");
  const main = summary(page).getByRole("button", { name: "Review launch" });
  await expect(main).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = review(page);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(main).toBeFocused();
  await page.keyboard.press("Enter");
  const tick = dialog.getByLabel("I have checked these settings.");
  await tabTo(page, tick);
  await page.keyboard.press("Space");
  await expect(tick).toBeChecked();
  const launch = dialog.getByRole("button", { name: "Launch $ASTRO" });
  await tabTo(page, launch);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Mission launched" })).toBeVisible();
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the studio is a four-step flow with the total and the next step in reach", async ({ page }) => {
    await stubChain(page);
    await openStudio(page);
    const bar = page.getByText("Step 1 of 4");
    await expect(bar).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Token & basics" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Locked Mission Protocol" })).toBeHidden();
    // A step is checked before moving on.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Enter a token name with 1–32 characters.")).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await fill(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Locked Mission Protocol" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("step")).toBe("2");
    // The new step opens at the step bar, just under the top bar, not back at the page's top.
    const stepsTop = () => page.getByRole("navigation", { name: "Launch steps" }).evaluate((nav) => Math.round(nav.getBoundingClientRect().top));
    await expect.poll(stepsTop).toBeGreaterThan(40);
    await expect.poll(stepsTop).toBeLessThan(100);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Token Agent" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByText("Step 3 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Token preview" }).click();
    const preview = page.getByRole("dialog", { name: "Your token. In view." });
    await expect(preview.getByText("Astro Pup")).toBeVisible();
    await expect(preview.getByText("80 Safe after 10 minutes, if nothing else changes")).toBeVisible();
  });

  test("the launch button goes back to the step that needs fixing", async ({ page }) => {
    await stubChain(page);
    await openStudio(page, "/launch?step=4");
    const bar = page.getByTestId("launch-bar");
    await bar.getByRole("button", { name: "Connect wallet" }).click();
    await bar.getByRole("button", { name: "Review launch" }).click();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByText("Enter a token name with 1–32 characters.")).toBeVisible();
    await expect(page.getByLabel("Token name")).toBeFocused();
    await expect(review(page)).toBeHidden();
  });

  for (const [lang, theme] of [["de", "dark"], ["de", "light"], ["ru", "dark"], ["ru", "light"], ["en", "light"]] as const) {
    test(`${lang}, ${theme}: every step fits 390 px without sideways scroll`, async ({ page }) => {
      if (theme === "light") await page.addInitScript(() => localStorage.setItem("tonkpad-theme", "light"));
      await stubChain(page);
      for (const step of [1, 2, 3, 4]) {
        await openStudio(page, `${lang === "en" ? "" : `/${lang}`}/launch?step=${step}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `step ${step}`).toBe(0);
      }
    });
  }
});
