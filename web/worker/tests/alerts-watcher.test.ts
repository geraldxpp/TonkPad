// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_EVENTS } from "../src/alerts/abi";
import type { AlertConfig } from "../src/alerts/config";
import { redactor } from "../src/alerts/deliver";
import { Dispatcher } from "../src/alerts/dispatcher";
import { freshState, parseState, serializeState } from "../src/alerts/state";
import { hexOf, lower } from "../src/alerts/types";
import { CONFIRMATIONS, Watcher } from "../src/alerts/watcher";
import { built, FakeRpc, GRADUATED, GRADUATION_TX, HEAD, LAUNCHPAD, MIGRATOR, OWNER, RECORDED, START_BLOCK, testConfig } from "./alerts-fixtures";

const DEPLOYMENT = { chainId: 46630, launchpad: LAUNCHPAD, migrator: MIGRATOR };

function setup(overrides: Partial<AlertConfig> = {}) {
  let now = 1_800_000_000_000;
  let tickMs = 0;
  const clock = () => (now += tickMs);
  const sent: string[] = [];
  const logs: string[] = [];
  const pings: number[] = [];
  const saves: string[] = [];
  const config = testConfig(overrides);
  const state = freshState();
  const dispatcher = new Dispatcher([{ name: "test", maxLength: 4096, send: async (text) => void sent.push(text) }], { header: "tonkfun.fun · Robinhood Chain Testnet", repeatMs: config.repeatMs, dryRun: false, log: (line) => logs.push(line), now: clock }, state.dispatch);
  const rpc = new FakeRpc();
  const redact = redactor(config.secrets.concat(config.rpcUrl));
  const watcher = new Watcher(
    config,
    { rpc, dispatcher, log: (line) => logs.push(line), now: clock, save: async (s) => void saves.push(serializeState(s, DEPLOYMENT)), ping: async () => void pings.push(now), redact },
    state,
  );
  return { watcher, rpc, sent, logs, pings, saves, state, advance: (ms: number) => (now += ms), drift: (ms: number) => (tickMs = ms) };
}

/** The recorded graduation's launchpad and migrator logs, as if they happened again at `block`. */
const graduationAt = (block: number) =>
  RECORDED.graduation.receipt.logs.filter((log) => [LAUNCHPAD, MIGRATOR].includes(lower(log.address))).map((log) => ({ ...log, blockNumber: hexOf(block) }));

describe("the watcher on the recorded testnet chain", () => {
  it("rebuilds from the deployment block without alerting on history, then says it started", async () => {
    const { watcher, sent, pings, saves, logs } = setup();
    await watcher.tick();
    expect(logs[0]).toBe(`rebuilding from the deployment block ${START_BLOCK}; history raises no alerts`);
    expect(sent).toHaveLength(1);
    expect(sent[0].split("\n")).toEqual([
      `🔵 tonkfun.fun · Robinhood Chain Testnet · block ${HEAD}`,
      "",
      "🔵 Launchpad watcher started",
      `Rebuilt from the deployment block ${START_BLOCK}, now at block ${HEAD}. Alerts go to: log only (no channel set).`,
      "Launchpad holds 0.000367 ETH and owes 0.000367 ETH; the migrator holds 0 ETH and owes 0 ETH.",
      "3 live curves (0 near graduation), 1 graduated. Not paused.",
      "Owner 0xd0d0…268f.",
    ]);
    expect(watcher.health()).toMatchObject({ enabled: true, chainId: 46630, lastBlock: HEAD, headBlock: HEAD + CONFIRMATIONS, lagBlocks: CONFIRMATIONS, rebuilding: false, activeAlerts: 0, unsentMessages: 0 });
    expect(watcher.health().lastAlertAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(pings).toHaveLength(1);
    expect(parseState(saves.at(-1)!, DEPLOYMENT)?.cursor).toBe(HEAD);
  });

  it("raises a live owner event, and ETH leaving the launchpad, in one critical message", async () => {
    const { watcher, rpc, sent, advance } = setup();
    await watcher.tick();
    rpc.logs = [...RECORDED.logs.logs, built(LAUNCHPAD_EVENTS, "Paused", { account: OWNER }, { address: LAUNCHPAD, block: HEAD + 5 })];
    rpc.head += 50;
    rpc.balances[LAUNCHPAD] -= BigInt(1000);
    advance(10_000);
    await watcher.tick();
    const message = sent[1].split("\n\n");
    expect(message[0]).toBe(`🔴 tonkfun.fun · Robinhood Chain Testnet · block ${HEAD + 50}`);
    expect(message.slice(1).map((part) => part.split("\n")[0])).toEqual(["🔴 Launchpad is short of ETH", "🔴 ETH left the launchpad with nothing to account for it", "🟠 Launchpad PAUSED"]);
  });

  it("checks a live graduation's receipt and reports what it moved", async () => {
    const { watcher, rpc, sent, advance } = setup({ largeOutflowWei: BigInt(1) });
    await watcher.tick();
    rpc.logs = [...RECORDED.logs.logs, ...graduationAt(HEAD + 10)];
    rpc.head += 30;
    advance(10_000);
    await watcher.tick();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("graduated: ");
    expect(sent[1]).toContain(`/tx/${GRADUATION_TX}`);
    expect(sent[1]).not.toContain("went wrong");
    expect(rpc.calls.some((call) => call.method === "eth_getTransactionReceipt")).toBe(true);
  });

  it("raises a stall when the RPC stops answering (its URL never shown) and resolves it on recovery", async () => {
    const { watcher, rpc, sent, logs, advance } = setup();
    await watcher.tick();
    rpc.fail = "connect ECONNREFUSED https://rpc.example/secret-rpc-key";
    advance(30_000);
    await watcher.tick();
    expect(sent).toHaveLength(1);
    advance(70_000);
    await watcher.tick();
    expect(sent[1]).toContain("🔴 Watcher has stopped reading the chain");
    expect(sent[1]).toContain("Last error: connect ECONNREFUSED (hidden).");
    rpc.fail = null;
    advance(10_000);
    await watcher.tick();
    expect(sent[2]).toContain("✅ Resolved: Watcher has stopped reading the chain (after 1 min)");
    expect([...sent, ...logs].join("\n")).not.toContain("secret-rpc-key");
  });

  it("raises a lag while it can't keep up with the chain", async () => {
    const { watcher, rpc, sent, advance, drift } = setup();
    await watcher.tick();
    rpc.head += 2_000_000;
    advance(10_000);
    drift(5_000);
    await watcher.tick();
    expect(sent[1]).toContain("🔴 Watcher is behind the chain");
    expect(watcher.health().lagBlocks).toBeGreaterThan(1_000_000);
  });

  it("pings the dead man's switch at most once a minute", async () => {
    const { watcher, pings, advance } = setup();
    await watcher.tick();
    advance(10_000);
    await watcher.tick();
    advance(55_000);
    await watcher.tick();
    expect(pings).toHaveLength(2);
  });

  it("applies a window whole or not at all: a failed receipt read leaves it to be read again", async () => {
    const { watcher, rpc, state, sent, advance } = setup({ largeOutflowWei: BigInt(1) });
    await watcher.tick();
    let refuse = true;
    rpc.handler = (call) => (call.method === "eth_getTransactionReceipt" && refuse ? { error: { code: -32000, message: "header not found", data: null } } : undefined);
    rpc.logs = [...RECORDED.logs.logs, ...graduationAt(HEAD + 10)];
    rpc.head += 30;
    const row = () => ({ ...state.ledger.missions.get(GRADUATED) });
    const before = row();
    advance(10_000);
    await watcher.tick();
    expect(state.cursor).toBe(HEAD);
    expect(state.ledger.dirty.size).toBe(0);
    expect(row()).toEqual(before);
    refuse = false;
    advance(10_000);
    await watcher.tick();
    expect(state.cursor).toBe(HEAD + 30);
    expect(sent.at(-1)).toContain("graduated: ");
    expect(sent.join("\n")).not.toContain("ledger disagreed");
  });

  it("reads balances every cycle and the settings every 30 s", async () => {
    const { watcher, rpc, advance } = setup();
    await watcher.tick();
    const launchFeeReads = () => rpc.calls.filter((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data === "0xcf3cf573").length;
    const balanceReads = () => rpc.calls.filter((call) => call.method === "eth_getBalance").length;
    const [fees, balances] = [launchFeeReads(), balanceReads()];
    for (const step of [10_000, 10_000, 15_000]) {
      advance(step);
      rpc.head += 50;
      await watcher.tick();
    }
    expect(balanceReads() - balances).toBe(6);
    expect(launchFeeReads() - fees).toBe(1);
  });
});
