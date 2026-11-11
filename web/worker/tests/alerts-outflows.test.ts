// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_EVENTS, MIGRATOR_EVENTS } from "../src/alerts/abi";
import { eth } from "../src/alerts/alert";
import { decodeLogs } from "../src/alerts/events";
import { Ledger } from "../src/alerts/ledger";
import { type OutflowFacts, outflowAlerts, transfersOf } from "../src/alerts/outflows";
import type { Address, RawTx } from "../src/alerts/types";
import { built, ctx, ETH, GRADUATED, GRADUATION_TX, LAUNCHPAD, MIGRATOR, OWNER, RECORDED, TRADER } from "./alerts-fixtures";

const ONE_WEI = BigInt(1);

/** The recorded graduation, with the curve's ETH before it from the ledger rebuilt over the recorded history. */
function recordedGraduation() {
  const ledger = new Ledger();
  const curveEthBefore = new Map<Address, bigint>();
  for (const event of decodeLogs(RECORDED.logs.logs, LAUNCHPAD, MIGRATOR, new Set())) {
    const applied = ledger.apply(event);
    if (applied && event.source === "launchpad" && event.kind === "graduated") curveEthBefore.set(event.token, applied.curveEthBefore);
  }
  const events = decodeLogs(RECORDED.graduation.receipt.logs, LAUNCHPAD, MIGRATOR, new Set());
  const facts: OutflowFacts = { curveEthBefore, txs: new Map<string, RawTx>([[GRADUATION_TX, RECORDED.graduation.tx]]), launchFee: null };
  return { events, facts };
}

describe("ETH transfers out, as the events account for them", () => {
  it("accounts for every wei the recorded graduation moved out of the launchpad and the migrator", () => {
    const { events, facts } = recordedGraduation();
    const trade = events.find((e) => e.source === "launchpad" && e.kind === "trade")!;
    const graduated = events.find((e) => e.source === "launchpad" && e.kind === "graduated")!;
    const locked = events.find((e) => e.source === "migrator" && e.kind === "poolLocked")!;
    if (trade.source !== "launchpad" || trade.kind !== "trade" || graduated.source !== "launchpad" || graduated.kind !== "graduated" || locked.source !== "migrator" || locked.kind !== "poolLocked") throw new Error("fixture changed");
    const transfers = transfersOf(events, facts, ctx);
    const why = (reason: string) => transfers.find((t) => t.why.startsWith(reason))?.amount;
    expect(why("refund of a capped buy")).toBe(BigInt(RECORDED.graduation.tx.value) - trade.grossEth);
    expect(why("graduation liquidity")).toBe(graduated.ethLiquidity);
    expect(why("graduation bonus")).toBe(graduated.creatorBonus);
    expect(why("pool seed")).toBe(locked.ethSeeded);
    // What left the curve: its ETH before the buy plus the buy's net, as liquidity, bonus and fee.
    const curve = facts.curveEthBefore.get(GRADUATED)!;
    expect(graduated.ethLiquidity + graduated.creatorBonus + why("graduation fee")!).toBe(curve);
    expect(transfers.every((t) => t.amount > BigInt(0))).toBe(true);
  });

  it("reports a graduation's transfers as information, and nothing under the threshold", () => {
    const { events, facts } = recordedGraduation();
    expect(outflowAlerts(events, facts, ETH, ctx)).toEqual([]);
    const [alert] = outflowAlerts(events, facts, ONE_WEI, ctx);
    expect(alert).toMatchObject({ key: `outflow:${GRADUATION_TX}`, severity: "info" });
    expect(alert.title).toMatch(new RegExp(`^${ctx.token(GRADUATED).replace(/[.$()…]/g, "\\$&")} graduated: [\\d.]+ ETH moved$`));
    const graduated = events.find((e) => e.source === "launchpad" && e.kind === "graduated");
    const liquidity = graduated && graduated.source === "launchpad" && graduated.kind === "graduated" ? graduated.ethLiquidity : BigInt(0);
    expect(alert.lines).toContain(`• ${eth(liquidity)} from the launchpad to the migrator: graduation liquidity of ${ctx.token(GRADUATED)}`);
  });

  it("raises a large sale payout and a large credit withdrawal as warnings", () => {
    const sale = built(LAUNCHPAD_EVENTS, "CurveTrade", { token: GRADUATED, trader: TRADER, isBuy: false, grossEth: ETH * BigInt(3), tokenAmount: BigInt(1), protocolFee: ETH / BigInt(100), crewFee: BigInt(0), creatorFee: BigInt(0), newVirtualEth: BigInt(1), newVirtualTokens: BigInt(1), remainingCurveTokens: BigInt(1) }, { address: LAUNCHPAD, tx: "0x0a" });
    const withdrawal = built(MIGRATOR_EVENTS, "FallbackEthWithdrawn", { recipient: OWNER, amount: ETH * BigInt(2) }, { address: MIGRATOR, tx: "0x0b" });
    const alerts = outflowAlerts(decodeLogs([sale, withdrawal], LAUNCHPAD, MIGRATOR, new Set()), { curveEthBefore: new Map(), txs: new Map(), launchFee: null }, ETH, ctx);
    expect(alerts.map((a) => [a.key, a.severity, a.title, a.lines[0]])).toEqual([
      ["outflow:0x0a", "warning", "Large ETH outflow: 2.99 ETH", `• 2.99 ETH from the launchpad to ${ctx.token(TRADER)}: sale of ${ctx.token(GRADUATED)}`],
      ["outflow:0x0b", "warning", "Large ETH outflow: 2 ETH", `• 2 ETH from the migrator to ${ctx.token(OWNER)}: ETH credit withdrawal`],
    ]);
  });

  it("doesn't count a push that failed and became a credit", () => {
    const sale = built(LAUNCHPAD_EVENTS, "CurveTrade", { token: GRADUATED, trader: TRADER, isBuy: false, grossEth: ETH * BigInt(100), tokenAmount: BigInt(1), protocolFee: ETH, crewFee: BigInt(0), creatorFee: BigInt(0), newVirtualEth: BigInt(1), newVirtualTokens: BigInt(1), remainingCurveTokens: BigInt(1) }, { address: LAUNCHPAD, tx: "0x0c", logIndex: 2 });
    const credited = built(LAUNCHPAD_EVENTS, "FallbackEthCredited", { recipient: OWNER, amount: ETH }, { address: LAUNCHPAD, tx: "0x0c", logIndex: 1 });
    const transfers = transfersOf(decodeLogs([credited, sale], LAUNCHPAD, MIGRATOR, new Set()), { curveEthBefore: new Map(), txs: new Map(), launchFee: null }, ctx);
    expect(transfers.map((t) => t.why)).toEqual([`sale of ${ctx.token(GRADUATED)}`]);
  });
});
