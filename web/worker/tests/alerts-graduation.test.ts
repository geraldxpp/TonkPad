// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_EVENTS } from "../src/alerts/abi";
import { dryRunCandidates, runDryRuns } from "../src/alerts/dryrun";
import { decodeLogs } from "../src/alerts/events";
import { dryRunAlerts, graduationAlerts, type PoolSetup, revertReason } from "../src/alerts/graduation";
import type { RpcReply } from "../src/alerts/rpc";
import { freshState } from "../src/alerts/state";
import type { RawLog, RawReceipt } from "../src/alerts/types";
import { built, ctx, FakeRpc, GRADUATED, GRADUATION_TX, GUARD, HEAD, LAUNCHPAD, LEADER, MIGRATOR, POOL_MANAGER, POSITION_MANAGER, RECORDED, testConfig } from "./alerts-fixtures";

const POOL: PoolSetup = { poolManager: POOL_MANAGER, positionManager: POSITION_MANAGER, guard: GUARD };
const receipt = RECORDED.graduation.receipt;
const events = (logs: RawLog[] = receipt.logs) => decodeLogs(logs, LAUNCHPAD, MIGRATOR, new Set());
const check = (logs: RawLog[], r: RawReceipt = { ...receipt, logs }) => graduationAlerts(events(logs), new Map([[GRADUATION_TX, r]]), ctx, POOL);
const without = (index: number) => receipt.logs.filter((_, i) => i !== index);

describe("graduations, from the transaction's own receipt", () => {
  it("passes the recorded testnet graduation: MissionGraduated, the guarded pool, and the position locked in the migrator", () => {
    expect(receipt.logs.map((log) => Number(log.logIndex))).toHaveLength(20);
    expect(check(receipt.logs)).toEqual([]);
  });

  it("raises a curve that sold out without MissionGraduated", () => {
    const [alert] = check(without(19));
    expect(alert).toMatchObject({ key: `graduation:${GRADUATION_TX}:${GRADUATED}`, severity: "critical", title: `Graduation of ${ctx.token(GRADUATED)} went wrong` });
    expect(alert.lines[0]).toBe("• its curve sold out but the launchpad logged no MissionGraduated");
  });

  it("raises a graduation with no pool from the PoolManager, the wrong hook, or no position for the migrator", () => {
    expect(check(without(8))[0].lines[0]).toBe("• Uniswap's PoolManager initialized no ETH pool for it");
    const otherHook = receipt.logs.map((log, i) => (i === 8 ? { ...log, data: log.data.replace(GUARD.slice(2), "1".repeat(40)) } : log));
    expect(check(otherHook)[0].lines[0]).toBe(`• its pool's hook is 0x${"1".repeat(40)}, not the guard`);
    expect(check(without(11))[0].lines[0]).toMatch(/^• the migrator received no position #\d+$/);
    expect(check(without(16))[0].lines[0]).toBe("• the migrator logged no PoolGraduatedAndLocked");
  });

  it("raises graduation ETH left waiting in the launchpad for a migrator", () => {
    const graduated = events().find((e) => e.source === "launchpad" && e.kind === "graduated")!;
    const noPool = built(LAUNCHPAD_EVENTS, "MissionGraduated", { token: GRADUATED, dexPoolOrPosition: "0x0000000000000000000000000000000000000000", ethLiquidity: "ethLiquidity" in graduated ? graduated.ethLiquidity : BigInt(0), tokenLiquidity: BigInt(1), creatorGradBonus: BigInt(1) }, { address: LAUNCHPAD, tx: GRADUATION_TX, block: Number(receipt.blockNumber), logIndex: 19 });
    const [alert] = check([...without(19), noPool]);
    expect(alert.lines[0]).toMatch(/^• it graduated with no migrator: [\d.]+ ETH waits in the launchpad for executePendingMigration$/);
  });
});

const recordedReply = (label: string): RpcReply => RECORDED.head.replies.find((r) => r.label === label)!.reply;

describe("the graduation dry run", () => {
  it("passes a curve whose graduating buy succeeds (as testnet's did)", () => {
    expect(dryRunAlerts([{ token: LEADER, progressBps: 1751, reply: recordedReply(`dryrun.${LEADER}`) }], ctx, "hint")).toEqual({ alerts: [], evaluated: [`dryrun:${LEADER}`, "dryrun-unavailable"] });
  });

  it("raises a lasting critical alert with the revert's reason", () => {
    // The recorded revert is the one testnet gives a buy of its graduated token; here it stands for any refusal.
    const reply = recordedReply(`dryrun.${GRADUATED}`);
    expect(revertReason(reply)).toBe("Tonkpad: Already graduated to DEX");
    const { alerts } = dryRunAlerts([{ token: LEADER, progressBps: 9_870, reply }], ctx, "hint");
    expect(alerts[0]).toMatchObject({ key: `dryrun:${LEADER}`, severity: "critical", condition: true, title: `Graduation of ${ctx.token(LEADER)} would revert` });
    expect(alerts[0].lines[0]).toBe("A buy that completes its curve (98.7% sold) fails: Tonkpad: Already graduated to DEX.");
    expect(revertReason({ error: { code: 3, message: "execution reverted", data: "0xd93c0665" } })).toBe("custom error 0xd93c0665");
  });

  it("says when the RPC can't run the simulation at all", () => {
    const refused: RpcReply = { error: { code: -32000, message: "err: insufficient funds for gas * price + value", data: null } };
    const { alerts, evaluated } = dryRunAlerts([{ token: LEADER, progressBps: 9_000, reply: refused }], ctx, "Set TONK_RPC_URL.");
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([["dryrun-unavailable", "warning"]]);
    expect(evaluated).toEqual([]);
  });

  it("runs on the curve furthest along and those past the threshold, never while paused", async () => {
    const state = freshState();
    for (const event of decodeLogs(RECORDED.logs.logs, LAUNCHPAD, MIGRATOR, new Set())) state.ledger.apply(event);
    expect(dryRunCandidates(state, 5_000).tokens.map((t) => t.token)).toEqual([LEADER]);
    expect(dryRunCandidates(state, 0).tokens).toHaveLength(3);
    state.dispatch.active[`dryrun:${GRADUATED}`] = { since: 0, lastSent: 0, title: "t", severity: "critical" };
    expect(dryRunCandidates(state, 5_000).resolved).toEqual([`dryrun:${GRADUATED}`]);

    const rpc = new FakeRpc();
    state.settings = { "launchpad.paused": "false" };
    const result = await runDryRuns(rpc, testConfig({ checkFromBps: 0 }), state, HEAD, ctx);
    expect(result.alerts).toEqual([]);
    expect(result.evaluated).toEqual(expect.arrayContaining([`dryrun:${LEADER}`, "dryrun-unavailable", `dryrun:${GRADUATED}`]));
    expect(rpc.calls.every((call) => call.method === "eth_call" && call.params.length === 3)).toBe(true);
    state.settings = { "launchpad.paused": "true" };
    expect(await runDryRuns(rpc, testConfig(), state, HEAD, ctx)).toEqual({ alerts: [], evaluated: [] });
  });
});
