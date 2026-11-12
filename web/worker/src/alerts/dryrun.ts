import { encodeFunctionData } from "viem";
import { LAUNCHPAD_VIEWS } from "./abi";
import type { Alert, AlertContext } from "./alert";
import type { AlertConfig } from "./config";
import { dryRunAlerts } from "./graduation";
import { Batch, simulate } from "./reads";
import type { AlertRpc } from "./rpc";
import type { WatcherState } from "./state";
import { type Address, ZERO_ADDRESS } from "./types";

/** An address with no code that the RPC funds for the simulation (a state override); nothing is ever sent from it. */
export const SIM_FROM: Address = "0x51a7000000000000000000000000000000000001";
/** 10,000 ETH: more than any curve needs to complete. The launchpad caps the buy at what completes the curve and refunds the rest. */
const SIM_VALUE = BigInt("10000000000000000000000");
const SIM_BALANCE = BigInt("100000000000000000000000");
/** Curves simulated per round, the furthest along first. */
export const DRY_RUNS_PER_ROUND = 20;

/**
 * Which curves get a graduation dry run: every live curve at least
 * ALERT_GRADUATION_CHECK_FROM_PCT sold, the one furthest along whatever its
 * progress (so a migrator that would refuse every graduation shows before
 * any curve nears the end), and any with an unresolved failed run.
 */
export function dryRunCandidates(state: WatcherState, checkFromBps: number): { tokens: Array<{ token: Address; progressBps: number }>; resolved: string[] } {
  const live = [...state.ledger.missions].filter(([, row]) => !row.graduated).sort((a, b) => b[1].progressBps - a[1].progressBps);
  const failing = new Set(Object.keys(state.dispatch.active).filter((key) => key.startsWith("dryrun:")).map((key) => key.slice("dryrun:".length)));
  const due = live.filter(([token, row], i) => row.progressBps >= checkFromBps || (i === 0 && row.progressBps > 0) || failing.has(token));
  // Curves whose last run failed go first, so their alert is re-checked every round.
  const picked = [...due.filter(([token]) => failing.has(token)), ...due.filter(([token]) => !failing.has(token))];
  // A curve that graduated since its run failed has proved it can.
  const resolved = [...failing].filter((token) => state.ledger.missions.get(token as Address)?.graduated).map((token) => `dryrun:${token}`);
  return { tokens: picked.slice(0, DRY_RUNS_PER_ROUND).map(([token, row]) => ({ token, progressBps: row.progressBps })), resolved };
}

/** One round of graduation dry runs at `block`; nothing while the launchpad is paused (every buy reverts then). */
export async function runDryRuns(rpc: AlertRpc, config: AlertConfig, state: WatcherState, block: number, ctx: AlertContext): Promise<{ alerts: Alert[]; evaluated: string[] }> {
  if (state.settings?.["launchpad.paused"] === "true") return { alerts: [], evaluated: [] };
  const { tokens, resolved } = dryRunCandidates(state, config.checkFromBps);
  const batch = new Batch();
  const runs = tokens.map(({ token, progressBps }) => {
    const data = encodeFunctionData({ abi: LAUNCHPAD_VIEWS, functionName: "buy", args: [token, BigInt(0), ZERO_ADDRESS] });
    return { token, progressBps, reply: batch.add(simulate(SIM_FROM, config.launchpad, data, SIM_VALUE, SIM_BALANCE, block)) };
  });
  await batch.run(rpc);
  const hint = "Set TONK_RPC_URL to an RPC that answers eth_call with state overrides (Robinhood Chain's public RPC does).";
  const result = dryRunAlerts(
    runs.map((run) => ({ token: run.token, progressBps: run.progressBps, reply: run.reply() })),
    ctx,
    hint,
  );
  return { alerts: result.alerts, evaluated: [...result.evaluated, ...resolved] };
}
