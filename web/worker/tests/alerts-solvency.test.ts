// @vitest-environment node
import { decodeFunctionResult, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_EVENTS, LAUNCHPAD_VIEWS, MIGRATOR_EVENTS } from "../src/alerts/abi";
import { runCheck } from "../src/alerts/check";
import { decodeLogs } from "../src/alerts/events";
import { Ledger } from "../src/alerts/ledger";
import { solvencyAlerts } from "../src/alerts/solvency";
import { freshState, type WatcherState } from "../src/alerts/state";
import type { Address } from "../src/alerts/types";
import { built, ctx, ETH, FakeRpc, GRADUATED, HEAD, LAUNCHPAD, LEADER, MIGRATOR, OWNER, POOL_MANAGER, RECORDED, testConfig } from "./alerts-fixtures";

const ZERO = BigInt(0);
const recordedEvents = () => decodeLogs(RECORDED.logs.logs, LAUNCHPAD, MIGRATOR, new Set());

function replayed(): WatcherState {
  const state = freshState();
  for (const event of recordedEvents()) state.ledger.apply(event);
  return state;
}

/** The chain's own realEthReserves for each token at the recorded block (getMissionTelemetry's realEthInPool). */
const telemetry = (token: string) => {
  const reply = RECORDED.head.replies.find((r) => r.label === `telemetry.${token}`)!.reply as { result: Hex };
  return decodeFunctionResult({ abi: LAUNCHPAD_VIEWS, functionName: "getMissionTelemetry", data: reply.result });
};

describe("the solvency ledger, rebuilt from the recorded testnet logs", () => {
  it("owes exactly what the launchpad holds, to the wei, and each curve matches the chain's own figure", () => {
    const { ledger } = replayed();
    expect(ledger.owed("launchpad")).toEqual({ curves: BigInt(RECORDED.head.balances.launchpad), credits: ZERO, pending: ZERO, total: BigInt(RECORDED.head.balances.launchpad) });
    expect(ledger.owed("migrator").total).toBe(ZERO);
    for (const [token, row] of ledger.missions) {
      const [, , progressBps, realEth, , , , graduated] = telemetry(token);
      expect({ token, value: row.value, graduated: row.graduated, progressBps: row.progressBps }).toEqual({ token, value: realEth, graduated, progressBps: Number(progressBps) });
    }
    expect([...ledger.missions.values()].map((row) => row.ticker)).toEqual(["TTONE", "APNL1", "APTM1", "APLV1"]);
  });

  it("knows each graduating curve's ETH, which the 1.5% graduation fee splits exactly", () => {
    const ledger = new Ledger();
    let before: bigint | null = null;
    for (const event of recordedEvents()) {
      const applied = ledger.apply(event);
      if (applied) before = applied.curveEthBefore;
    }
    const graduated = recordedEvents().find((e) => e.source === "launchpad" && e.kind === "graduated");
    if (!before || !graduated || graduated.source !== "launchpad" || graduated.kind !== "graduated") throw new Error("no graduation recorded");
    const fee = (before * BigInt(100)) / BigInt(10_000);
    const bonus = (before * BigInt(50)) / BigInt(10_000);
    expect(graduated.creatorBonus).toBe(bonus);
    expect(graduated.ethLiquidity).toBe(before - fee - bonus);
    expect(ledger.missions.get(GRADUATED)).toMatchObject({ value: ZERO, graduated: true, progressBps: 10_000 });
  });

  it("adds credits, the launch-block tax and graduation ETH waiting for a migrator, and clears them when paid", () => {
    const ledger = new Ledger();
    const apply = (abi: typeof LAUNCHPAD_EVENTS | typeof MIGRATOR_EVENTS, address: string, name: string, args: Record<string, unknown>) =>
      decodeLogs([built(abi, name, args, { address })], LAUNCHPAD, MIGRATOR, new Set()).forEach((e) => ledger.apply(e));
    apply(LAUNCHPAD_EVENTS, LAUNCHPAD, "FallbackEthCredited", { recipient: OWNER, amount: ETH });
    apply(MIGRATOR_EVENTS, MIGRATOR, "FallbackEthCredited", { recipient: OWNER, amount: ETH / BigInt(2) });
    apply(LAUNCHPAD_EVENTS, LAUNCHPAD, "BundleTaxCollected", { token: LEADER, sniper: OWNER, penaltyEth: BigInt(99) });
    apply(LAUNCHPAD_EVENTS, LAUNCHPAD, "MissionGraduated", { token: GRADUATED, dexPoolOrPosition: "0x0000000000000000000000000000000000000000", ethLiquidity: ETH * BigInt(2), tokenLiquidity: BigInt(1), creatorGradBonus: BigInt(1) });
    expect(ledger.owed("launchpad")).toEqual({ curves: BigInt(99), credits: ETH, pending: ETH * BigInt(2), total: ETH * BigInt(3) + BigInt(99) });
    expect(ledger.owed("migrator").total).toBe(ETH / BigInt(2));
    apply(LAUNCHPAD_EVENTS, LAUNCHPAD, "FallbackEthWithdrawn", { recipient: OWNER, amount: ETH });
    apply(MIGRATOR_EVENTS, MIGRATOR, "PoolGraduatedAndLocked", { token: GRADUATED, positionTokenId: BigInt(7), ethSeeded: ETH, tokensSeeded: BigInt(1), poolFee: 30_000 });
    expect(ledger.owed("launchpad").total).toBe(BigInt(99));
    // A curve first seen through a trade, and a withdrawal with no credit before it, aren't the chain's figures until read.
    expect(ledger.missions.get(LEADER)?.verified).toBe(false);
    apply(MIGRATOR_EVENTS, MIGRATOR, "FallbackEthWithdrawn", { recipient: LAUNCHPAD, amount: BigInt(5) });
    expect(ledger.credits.migrator.get(LAUNCHPAD)).toEqual({ value: ZERO, verified: false });
  });

  it("tells a correction after events it applied from a row it had stale", () => {
    const { ledger } = replayed();
    ledger.dirty.clear();
    expect(ledger.correct(`mission:${LEADER}`, BigInt(1))).toMatchObject({ modelled: false });
    ledger.dirty.add(`mission:${LEADER}`);
    expect(ledger.correct(`mission:${LEADER}`, BigInt(2))).toEqual({ key: `mission:${LEADER}`, delta: BigInt(1), modelled: true });
    expect(ledger.correct(`mission:${LEADER}`, BigInt(2))).toBeNull();
  });
});

describe("solvency alerts", () => {
  const owed = { curves: ETH, credits: ZERO, pending: ZERO, total: ETH };
  const check = (balance: bigint, baseline: bigint | null) => solvencyAlerts({ contract: "launchpad", balance, owed, baseline, fromBlock: 10, toBlock: 20 }, ctx);

  it("stays quiet while the balance covers what is owed, a gift included", () => {
    expect(check(ETH, ZERO).alerts).toEqual([]);
    expect(check(ETH + BigInt(5), ZERO)).toMatchObject({ alerts: [], surplus: BigInt(5) });
  });

  it("raises a lasting critical shortfall with the amounts", () => {
    const [shortfall] = check(ETH - BigInt(1), null).alerts;
    expect(shortfall).toMatchObject({ key: "solvency:launchpad", severity: "critical", condition: true, title: "Launchpad is short of ETH" });
    // Amounts show six decimals; one too small for that shows every digit.
    expect(shortfall.lines[0]).toBe("It holds 0.999999 ETH but owes 1 ETH: 1 ETH in live curves, 0 ETH in unclaimed ETH credits, 0 ETH waiting for a migrator.");
    expect(shortfall.lines[1]).toBe("Short by 0.000000000000000001 ETH at block 20.");
  });

  it("raises ETH that left with nothing to account for it, even while still solvent", () => {
    const { alerts } = check(ETH + BigInt(5), BigInt(10));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: "unexplained:launchpad:20", severity: "critical" });
    expect(alerts[0].lines[0]).toContain("0.000000000000000005 ETH left the launchpad between blocks 10 and 20");
  });
});

describe("a check against the recorded chain", () => {
  it("finds the recorded testnet launchpad solvent, links intact, and nothing to say", async () => {
    const state = replayed();
    const rpc = new FakeRpc();
    const result = await runCheck(rpc, testConfig(), state, HEAD, ctx, 0, new Map());
    expect(result.alerts).toEqual([]);
    expect(result.evaluated).toEqual(expect.arrayContaining(["solvency:launchpad", "solvency:migrator", "integrity:migrator-link", "integrity:guard-flags", `pool:${GRADUATED}`]));
    expect(state.surplus).toEqual({ launchpad: ZERO, migrator: ZERO });
    expect(state.settings).toMatchObject({ "launchpad.owner": OWNER, "launchpad.launchFee": "100000000000000", "launchpad.paused": "false", "guard.migrator": MIGRATOR });
    expect(state.ledger.dirty.size).toBe(0);
  });

  it("raises ETH leaving the launchpad, confirmed by re-reading every curve first", async () => {
    const state = replayed();
    const rpc = new FakeRpc();
    await runCheck(rpc, testConfig(), state, HEAD, ctx, 0, new Map());
    rpc.balances[LAUNCHPAD] -= BigInt(1000);
    rpc.calls.length = 0;
    const { alerts } = await runCheck(rpc, testConfig(), state, HEAD, ctx, 0, new Map());
    expect(alerts.map((a) => a.key)).toEqual(["solvency:launchpad", `unexplained:launchpad:${HEAD}`]);
    const telemetryReads = rpc.calls.filter((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data.startsWith("0xbde46de0"));
    expect(telemetryReads.length).toBeGreaterThanOrEqual(3);
  });

  it("puts a missed log right without crying wolf: the row is corrected and the baseline moves with it", async () => {
    const state = replayed();
    const rpc = new FakeRpc();
    await runCheck(rpc, testConfig(), state, HEAD, ctx, 0, new Map());
    // As if a buy's log had been missed: the ledger counts less for this curve than the chain does, and the surplus looked higher.
    const row = state.ledger.missions.get(LEADER)!;
    row.value -= BigInt(500);
    state.surplus.launchpad = BigInt(500);
    const { alerts } = await runCheck(rpc, testConfig(), state, HEAD, ctx, 0, new Map());
    expect(alerts.map((a) => a.key)).toEqual([`drift:${HEAD}`]);
    expect(alerts[0].lines[1]).toBe(`curve of ${ctx.token(LEADER)}: +0.0000000000000005 ETH`);
    expect(state.surplus.launchpad).toBe(ZERO);
    expect(state.ledger.missions.get(LEADER)?.value).toBe(BigInt(225305174130576));
  });

  it("raises a migrator that serves another launchpad, and a guard with other hook flags", async () => {
    const state = replayed();
    const rpc = new FakeRpc((call) => {
      const data = (call.params[0] as { data?: string })?.data;
      if (call.method === "eth_call" && data === "0x02669b52") return { result: `0x${"0".repeat(24)}${"1".repeat(40)}` };
      if (call.method === "eth_call" && data === "0x4aa6ab11") return { result: word(GUARD_WITH_SWAP_FLAG) };
      // That guard's own views: it serves the right migrator and PoolManager, so only its flags are wrong.
      if (call.method === "eth_call" && data === "0x7cd07e47") return { result: word(MIGRATOR) };
      if (call.method === "eth_call" && data === "0xdc4c90d3") return { result: word(POOL_MANAGER) };
      return undefined;
    });
    const { alerts } = await runCheck(rpc, testConfig(), state, HEAD, ctx, 0, new Map());
    expect(alerts.map((a) => a.key).sort()).toEqual(["integrity:guard-flags", "integrity:launchpad-link"]);
  });
});

const word = (address: string) => `0x${"0".repeat(24)}${address.slice(2)}`;
/** A hook address with beforeSwap (bit 7) set as well as beforeInitialize (bit 13). */
const GUARD_WITH_SWAP_FLAG: Address = "0x42d543c4586c68e198e067a77a2189c9abb72080";
