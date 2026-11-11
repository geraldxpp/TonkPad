import { type Alert, type AlertContext, eth, short, txLink } from "./alert";
import type { ChainEvent } from "./events";
import type { Address, Contract, Hex, RawTx } from "./types";

const ZERO = BigInt(0);

/** One ETH transfer out of a watched contract, as its events account for it. */
export interface Transfer {
  from: Contract;
  amount: bigint;
  /** Who received it, worded for the owner. */
  to: string;
  why: string;
}

/** Facts beyond the logs: each graduated curve's ETH just before it graduated, the transactions of curve-completing buys (for refunds), and the launch fee. */
export interface OutflowFacts {
  curveEthBefore: ReadonlyMap<Address, bigint>;
  txs: ReadonlyMap<string, RawTx>;
  launchFee: bigint | null;
}

const fees = (e: { protocolFee: bigint; crewFee: bigint; creatorFee: bigint }, token: string): Transfer[] => [
  { from: "launchpad", amount: e.protocolFee, to: "the treasury (and any referrer)", why: "protocol fee" },
  { from: "launchpad", amount: e.crewFee, to: `${token}'s Crew holders`, why: "Crew fee" },
  { from: "launchpad", amount: e.creatorFee, to: `${token}'s creator`, why: "creator fee" },
];

/** Every ETH transfer out of the launchpad and the migrator in one transaction, as its events account for them. */
export function transfersOf(events: readonly ChainEvent[], facts: OutflowFacts, ctx: AlertContext): Transfer[] {
  const out: Transfer[] = [];
  const bundle = events.reduce((sum, e) => (e.source === "launchpad" && e.kind === "bundleTax" ? sum + e.penaltyEth : sum), ZERO);
  const launch = events.find((e) => e.source === "launchpad" && e.kind === "launched");
  for (const e of events) {
    if (e.source === "launchpad") {
      const token = "token" in e ? ctx.token(e.token) : "";
      if (e.kind === "launched" && facts.launchFee !== null) out.push({ from: "launchpad", amount: facts.launchFee, to: "the treasury", why: "launch fee" });
      if (e.kind === "trade" && !e.isBuy) out.push({ from: "launchpad", amount: e.grossEth - e.protocolFee - e.crewFee - e.creatorFee, to: short(e.trader), why: `sale of ${token}` });
      if (e.kind === "trade") out.push(...fees(e, token));
      if (e.kind === "trade" && e.isBuy && e.remaining === ZERO) {
        // Only the buy that completes a curve is capped; the rest of what it paid goes back to the buyer.
        const paid = launch && launch.source === "launchpad" && launch.kind === "launched" ? launch.devBuyEth : BigInt(facts.txs.get(e.tx)?.value ?? "0x0") - bundle;
        if (paid > e.grossEth) out.push({ from: "launchpad", amount: paid - e.grossEth, to: short(e.trader), why: `refund of a capped buy of ${token}` });
      }
      if (e.kind === "graduated") {
        const before = facts.curveEthBefore.get(e.token);
        out.push({ from: "launchpad", amount: e.ethLiquidity, to: e.pool === ctx.migrator ? "the migrator" : short(e.pool), why: `graduation liquidity of ${token}` });
        out.push({ from: "launchpad", amount: e.creatorBonus, to: `${token}'s creator`, why: "graduation bonus" });
        if (before !== undefined) out.push({ from: "launchpad", amount: before - e.ethLiquidity - e.creatorBonus, to: "the treasury", why: "graduation fee" });
      }
      if (e.kind === "withdrawn") out.push({ from: "launchpad", amount: e.amount, to: short(e.account), why: "ETH credit withdrawal" });
    } else if (e.source === "migrator") {
      const token = "token" in e ? ctx.token(e.token) : "";
      if (e.kind === "poolLocked") out.push({ from: "migrator", amount: e.ethSeeded, to: "Uniswap's PoolManager", why: `pool seed of ${token}` });
      if (e.kind === "remainder") out.push({ from: "migrator", amount: e.ethToTreasury, to: "the treasury", why: "seeding remainder" });
      if (e.kind === "postGrad") {
        out.push({ from: "migrator", amount: e.protocolEth, to: "the treasury", why: `pool fees of ${token}` });
        out.push({ from: "migrator", amount: e.crewEth, to: `${token}'s Crew holders`, why: "pool fees" });
        out.push({ from: "migrator", amount: e.creatorEth, to: `${token}'s creator`, why: "pool fees" });
      }
      if (e.kind === "withdrawn") out.push({ from: "migrator", amount: e.amount, to: short(e.account), why: "ETH credit withdrawal" });
    }
  }
  // A push that failed became a credit instead (FallbackEthCredited): that amount never left.
  for (const e of events) {
    if ((e.source === "launchpad" || e.source === "migrator") && e.kind === "credited") {
      const i = out.findIndex((t) => t.from === e.source && t.amount === e.amount && t.why !== "ETH credit withdrawal");
      if (i >= 0) out.splice(i, 1);
    }
  }
  return out.filter((t) => t.amount > ZERO);
}

/** Any single ETH transfer out of either contract at or above ALERT_LARGE_OUTFLOW_ETH, one alert per transaction. */
export function outflowAlerts(events: readonly ChainEvent[], facts: OutflowFacts, thresholdWei: bigint, ctx: AlertContext): Alert[] {
  const byTx = new Map<Hex, ChainEvent[]>();
  for (const e of events) if (e.source !== "safe") byTx.set(e.tx, [...(byTx.get(e.tx) ?? []), e]);
  const alerts: Alert[] = [];
  for (const [tx, list] of byTx) {
    const large = transfersOf(list, facts, ctx).filter((t) => t.amount >= thresholdWei);
    if (large.length === 0) continue;
    const graduation = list.find((e) => e.source === "launchpad" && e.kind === "graduated");
    const total = large.reduce((sum, t) => sum + t.amount, ZERO);
    alerts.push({
      key: `outflow:${tx}`,
      severity: graduation ? "info" : "warning",
      title: graduation && "token" in graduation ? `${ctx.token(graduation.token)} graduated: ${eth(total)} moved` : `Large ETH outflow: ${eth(total)}`,
      lines: [...large.slice(0, 8).map((t) => `• ${eth(t.amount)} from the ${t.from} to ${t.to}: ${t.why}`), `Block ${list[0].block}.`, txLink(ctx, tx)],
    });
  }
  return alerts;
}
