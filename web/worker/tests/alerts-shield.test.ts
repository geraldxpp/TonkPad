// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_EVENTS, MIGRATOR_EVENTS } from "../src/alerts/abi";
import { decodeLogs } from "../src/alerts/events";
import { graduationAlerts } from "../src/alerts/graduation";
import { Ledger } from "../src/alerts/ledger";
import { type OutflowFacts, outflowAlerts, transfersOf } from "../src/alerts/outflows";
import { solvencyAlerts } from "../src/alerts/solvency";
import type { RawLog, RawTx } from "../src/alerts/types";
import { eth } from "../src/alerts/alert";
import { built, ctx, ETH, GUARD, HEAD, LAUNCHPAD, MIGRATOR, OWNER, POOL_MANAGER, POSITION_MANAGER, RECORDED } from "./alerts-fixtures";
import { setup } from "./alerts-harness";
import { BUYER, GRADUATION, graduationReceipt, scenarioReads, SHIELD_TX, shieldLogs, shieldNumbers, SNIPER, TOKEN } from "./alerts-scenario";

const n = shieldNumbers();
const ZERO = BigInt(0);
const decode = (logs: RawLog[]) => decodeLogs(logs, LAUNCHPAD, MIGRATOR, new Set());
const { launch, shield, graduation } = shieldLogs(1_000);
const facts = (overrides: Partial<OutflowFacts> = {}): OutflowFacts => ({ curveEthBefore: new Map(), txs: new Map(), launchFee: null, taxBurned: true, ...overrides });

describe("the launch-block tax on the mainnet build (F-1)", () => {
  it("rounds the tax up and burns it: the curve keeps only the buy's net, so nothing looks short", () => {
    expect(n.penalty).toBe(BigInt("990000000000000001"));
    const ledger = new Ledger();
    for (const event of decode([...launch, ...shield])) ledger.apply(event);
    expect(ledger.missions.get(TOKEN)?.value).toBe(n.net);
    // What the launchpad keeps of the sniper's payment once the fee and the tax have left in the same transaction.
    const held = n.value - n.protocol - n.penalty;
    expect(held).toBe(n.net);
    expect(solvencyAlerts({ contract: "launchpad", balance: held, owed: ledger.owed("launchpad"), baseline: ZERO, fromBlock: 1_000, toBlock: 1_001 }, ctx).alerts).toEqual([]);
  });

  it("still counts the tax into the curve on the testnet release, which kept it there", () => {
    const ledger = new Ledger();
    ledger.taxIntoCurve = true;
    for (const event of decode([...launch, ...shield])) ledger.apply(event);
    expect(ledger.missions.get(TOKEN)?.value).toBe(n.net + n.penalty);
  });

  it("counts the burn as ETH leaving the launchpad for 0xdead", () => {
    expect(transfersOf(decode(shield), facts(), ctx).map((t) => [t.why, t.to, t.amount])).toEqual([
      [`launch-block tax on a buy of ${ctx.token(TOKEN)}`, "0xdead (burned)", n.penalty],
      ["protocol fee", "the treasury (and any referrer)", n.protocol],
    ]);
    expect(transfersOf(decode(shield), facts({ taxBurned: false }), ctx).map((t) => t.why)).toEqual(["protocol fee"]);
    const [alert] = outflowAlerts(decode(shield), facts(), ETH / BigInt(2), ctx);
    expect(alert).toMatchObject({ key: `outflow:${SHIELD_TX}`, severity: "warning", title: "Large ETH outflow: 0.99 ETH" });
    expect(alert.lines[0]).toBe(`• 0.99 ETH from the launchpad to 0xdead (burned): launch-block tax on a buy of ${ctx.token(TOKEN)}`);
  });

  it("refunds a capped buy inside the shield what is left after the tax", () => {
    const tx = `0x${"a5".repeat(32)}`;
    const penalty = (ETH * BigInt(9_900) + BigInt(9_999)) / BigInt(10_000);
    const gross = BigInt(4e15);
    const logs = [
      built(LAUNCHPAD_EVENTS, "BundleTaxCollected", { token: TOKEN, sniper: SNIPER, penaltyEth: penalty }, { address: LAUNCHPAD, tx, logIndex: 0 }),
      built(LAUNCHPAD_EVENTS, "CurveTrade", { token: TOKEN, trader: SNIPER, isBuy: true, grossEth: gross, tokenAmount: BigInt(1), protocolFee: gross / BigInt(100), crewFee: ZERO, creatorFee: ZERO, newVirtualEth: BigInt(1), newVirtualTokens: BigInt(1), remainingCurveTokens: ZERO }, { address: LAUNCHPAD, tx, logIndex: 1 }),
    ];
    const paid: RawTx = { hash: tx, from: SNIPER, to: LAUNCHPAD, value: `0x${ETH.toString(16)}`, input: "0x" };
    const refund = transfersOf(decode(logs), facts({ txs: new Map([[tx, paid]]) }), ctx).find((t) => t.why.startsWith("refund"));
    expect(refund?.amount).toBe(ETH - penalty - gross);
  });
});

describe("a graduation after a buy in the shield", () => {
  it("graduates on curve-backed ETH only: the 1.5% is taken from the curve without the tax", () => {
    const ledger = new Ledger();
    let before: bigint | null = null;
    for (const event of decode([...launch, ...shield, ...graduation])) before = ledger.apply(event)?.curveEthBefore ?? before;
    expect(before).toBe(n.curve);
    expect(ledger.owed("launchpad").total).toBe(ZERO);
    const events = decode(graduation);
    const moved = transfersOf(events, facts({ curveEthBefore: new Map([[TOKEN, n.curve]]), txs: new Map([[GRADUATION, graduationReceipt(1_000).tx]]) }), ctx);
    const amount = (reason: string) => moved.find((t) => t.why.startsWith(reason))?.amount;
    expect([amount("graduation fee"), amount("graduation liquidity"), amount("graduation bonus"), amount("refund of a capped buy")]).toEqual([n.fee, n.liquidity, n.bonus, n.refund]);
    expect(moved.find((t) => t.why.startsWith("refund"))?.to).toBe(ctx.token(BUYER));
    const pool = { poolManager: POOL_MANAGER, positionManager: POSITION_MANAGER, guard: GUARD };
    expect(graduationAlerts(events, new Map([[GRADUATION, graduationReceipt(1_000).receipt]]), ctx, pool)).toEqual([]);
  });
});

describe("the Crew floor after graduation (F-2)", () => {
  it("tells the Crew's redirected share of pool fees apart from the protocol's own", () => {
    const tx = `0x${"a4".repeat(32)}`;
    const share = BigInt(2e15);
    const logs = [
      built(MIGRATOR_EVENTS, "CrewRewardRedirected", { token: TOKEN, treasury: OWNER, amount: share }, { address: MIGRATOR, tx, logIndex: 1 }),
      built(MIGRATOR_EVENTS, "PostGradRewardsDistributed", { token: TOKEN, protocolEth: BigInt(3e15) + share, crewEth: ZERO, creatorEth: BigInt(1e15), tokensBurned: ZERO }, { address: MIGRATOR, tx, logIndex: 2 }),
    ];
    expect(transfersOf(decode(logs), facts(), ctx).map((t) => [t.why, t.amount])).toEqual([
      [`pool fees of ${ctx.token(TOKEN)}`, BigInt(3e15)],
      [`the Crew's share of ${ctx.token(TOKEN)}'s pool fees, redirected (too few eligible holders)`, share],
      ["pool fees", BigInt(1e15)],
    ]);
  });
});

describe("the watcher on the mainnet build", () => {
  it("reads where the launch-block tax goes from the deployed code before it applies any event", async () => {
    const testnetRelease = setup();
    await testnetRelease.watcher.tick();
    expect(testnetRelease.state.ledger.taxIntoCurve).toBe(true);
    const mainnetBuild = setup();
    mainnetBuild.rpc.handler = scenarioReads(HEAD, () => ({ realEth: ZERO, progressBps: 0, graduated: false }));
    await mainnetBuild.watcher.tick();
    expect(mainnetBuild.state.ledger.taxIntoCurve).toBe(false);
  });

  it("follows a buy in the shield and then the graduation with no false alarm", async () => {
    const block = HEAD + 5;
    let curve = { realEth: ZERO, progressBps: 0, graduated: false };
    const { watcher, rpc, sent, state, advance } = setup({ largeOutflowWei: ETH / BigInt(2) });
    rpc.handler = scenarioReads(block, () => curve);
    await watcher.tick();
    const logs = shieldLogs(block);

    // The launch and a buy in its shield: the launchpad keeps only the curve's net; the tax went to 0xdead.
    rpc.logs = [...RECORDED.logs.logs, ...logs.launch, ...logs.shield];
    rpc.head += 10;
    rpc.balances[LAUNCHPAD] += n.net;
    curve = { realEth: n.net, progressBps: 1_250, graduated: false };
    advance(10_000);
    await watcher.tick();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain(`🟠 Large ETH outflow: 0.99 ETH\n• 0.99 ETH from the launchpad to 0xdead (burned): launch-block tax on a buy of $SHLD (0x5e1d…c0de)`);
    expect(state.ledger.missions.get(TOKEN)?.value).toBe(n.net);

    // The buy that completes the curve: it graduates on the curve's own ETH, and the launchpad is back where it was.
    rpc.logs = [...rpc.logs, ...logs.graduation];
    rpc.head += 30;
    rpc.balances[LAUNCHPAD] -= n.net;
    curve = { realEth: ZERO, progressBps: 10_000, graduated: true };
    advance(10_000);
    await watcher.tick();
    expect(sent).toHaveLength(3);
    // Only transfers at or above the threshold are listed: the 2.5% fees and the 1.5% split stay under it.
    expect(sent[2].split("\n").slice(2, 6)).toEqual([
      `🔵 $SHLD (0x5e1d…c0de) graduated: ${eth(n.refund + (n.liquidity - BigInt(1)) + n.liquidity)} moved`,
      "• 0.5 ETH from the launchpad to 0xb0b0…0b0b: refund of a capped buy of $SHLD (0x5e1d…c0de)",
      `• ${eth(n.liquidity - BigInt(1))} from the migrator to Uniswap's PoolManager: pool seed of $SHLD (0x5e1d…c0de)`,
      `• ${eth(n.liquidity)} from the launchpad to the migrator: graduation liquidity of $SHLD (0x5e1d…c0de)`,
    ]);
    expect(sent.join("\n")).not.toMatch(/short of ETH|nothing to account|ledger disagreed|went wrong|locked pool position/);
    // The launchpad owes what the recorded testnet curves did before the scenario, and the graduated token nothing.
    expect(state.ledger.owed("launchpad").total).toBe(BigInt(RECORDED.head.balances.launchpad));
    expect(state.ledger.missions.get(TOKEN)).toMatchObject({ value: ZERO, graduated: true, progressBps: 10_000 });
  });
});
