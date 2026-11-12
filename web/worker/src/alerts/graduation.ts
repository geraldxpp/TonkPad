import { decodeAbiParameters, decodeFunctionResult, getAbiItem, toEventSelector } from "viem";
import { LAUNCHPAD_VIEWS, UNISWAP_EVENTS } from "./abi";
import { type Alert, type AlertContext, eth, plain, txLink } from "./alert";
import type { ChainEvent } from "./events";
import type { RpcReply } from "./rpc";
import { type Address, type Hex, lower, type RawReceipt, ZERO_ADDRESS } from "./types";

const ZERO = BigInt(0);
/** The PoolManager's Initialize and the PositionManager's ERC-721 Transfer (four topics, unlike an ERC-20's three). */
const INITIALIZE = toEventSelector(getAbiItem({ abi: UNISWAP_EVENTS, name: "Initialize" }));
const TRANSFER = toEventSelector(getAbiItem({ abi: UNISWAP_EVENTS, name: "Transfer" }));
const TICK_SPACING = 60;

/** The Uniswap contracts a graduation must touch, as the migrator names them. */
export interface PoolSetup {
  poolManager: Address;
  positionManager: Address;
  guard: Address;
}

const topicAddress = (topic: string | undefined) => lower(`0x${(topic ?? "").slice(-40)}`);

/** What a graduating transaction's receipt is missing; empty when the pool was seeded and its position locked in the migrator. */
export function graduationProblems(token: Address, tx: Hex, events: readonly ChainEvent[], receipt: RawReceipt | null, ctx: AlertContext, pool: PoolSetup): string[] {
  const inTx = events.filter((e) => e.tx === tx);
  const graduated = inTx.find((e) => e.source === "launchpad" && e.kind === "graduated" && e.token === token);
  const locked = inTx.find((e) => e.source === "migrator" && e.kind === "poolLocked" && e.token === token);
  if (!graduated || graduated.source !== "launchpad" || graduated.kind !== "graduated") return ["its curve sold out but the launchpad logged no MissionGraduated"];
  if (graduated.pool === ZERO_ADDRESS) return [`it graduated with no migrator: ${eth(graduated.ethLiquidity)} waits in the launchpad for executePendingMigration`];
  const problems: string[] = [];
  if (graduated.pool !== ctx.migrator) problems.push(`its liquidity went to ${graduated.pool}, not the migrator`);
  if (!locked || locked.source !== "migrator" || locked.kind !== "poolLocked") return [...problems, "the migrator logged no PoolGraduatedAndLocked"];
  if (!receipt) return [...problems, "its receipt couldn't be read"];
  if (receipt.status !== "0x1") problems.push("its receipt says it failed");
  const initialized = receipt.logs.find(
    (log) => lower(log.address) === pool.poolManager && log.topics[0] === INITIALIZE && topicAddress(log.topics[2]) === ZERO_ADDRESS && topicAddress(log.topics[3]) === token,
  );
  if (!initialized) problems.push("Uniswap's PoolManager initialized no ETH pool for it");
  else {
    const [fee, spacing, hooks] = decodeAbiParameters([{ type: "uint24" }, { type: "int24" }, { type: "address" }], initialized.data as Hex);
    if (lower(hooks) !== pool.guard) problems.push(`its pool's hook is ${lower(hooks)}, not the guard`);
    if (spacing !== TICK_SPACING || fee !== locked.poolFee) problems.push(`its pool has fee ${fee} and spacing ${spacing}, not ${locked.poolFee} and ${TICK_SPACING}`);
  }
  const minted = receipt.logs.some(
    (log) => lower(log.address) === pool.positionManager && log.topics[0] === TRANSFER && log.topics.length === 4 && topicAddress(log.topics[1]) === ZERO_ADDRESS && topicAddress(log.topics[2]) === ctx.migrator && BigInt(log.topics[3] ?? "0x0") === locked.positionId,
  );
  if (!minted) problems.push(`the migrator received no position #${locked.positionId}`);
  return problems;
}

/** Transactions that completed a curve or graduated one, with the tokens concerned. */
export function graduatingTxs(events: readonly ChainEvent[]): Map<Hex, Address[]> {
  const txs = new Map<Hex, Address[]>();
  for (const e of events) {
    if (e.source !== "launchpad" || !((e.kind === "trade" && e.remaining === ZERO) || e.kind === "graduated")) continue;
    const tokens = txs.get(e.tx) ?? [];
    if (!tokens.includes(e.token)) tokens.push(e.token);
    txs.set(e.tx, tokens);
  }
  return txs;
}

/** A curve that completed without its graduation, pool and locked position, from the transaction's own receipt. */
export function graduationAlerts(events: readonly ChainEvent[], receipts: ReadonlyMap<string, RawReceipt | null>, ctx: AlertContext, pool: PoolSetup): Alert[] {
  return [...graduatingTxs(events)].flatMap(([tx, tokens]) =>
    tokens.flatMap((token) => {
      const problems = graduationProblems(token, tx, events, receipts.get(tx) ?? null, ctx, pool);
      if (problems.length === 0) return [];
      return [{ key: `graduation:${tx}:${token}`, severity: "critical" as const, title: `Graduation of ${ctx.token(token)} went wrong`, lines: [...problems.map((p) => `• ${p}`), txLink(ctx, tx)] }];
    }),
  );
}

/** A revert's reason as plain text: Error(string), Panic(uint256), or the custom error's selector. */
export function revertReason(reply: RpcReply): string {
  if (!("error" in reply)) return "";
  const { data, message } = reply.error;
  try {
    if (data?.startsWith("0x08c379a0")) return String(decodeAbiParameters([{ type: "string" }], `0x${data.slice(10)}`)[0]);
    if (data?.startsWith("0x4e487b71")) return `panic ${decodeAbiParameters([{ type: "uint256" }], `0x${data.slice(10)}`)[0]}`;
    if (data && data.length >= 10) return `custom error ${data.slice(0, 10)}`;
  } catch {
    // Falls back to the node's message.
  }
  return message.replace(/^execution reverted:?\s*/i, "") || "no reason given";
}

/**
 * The graduation dry run: a buy large enough to complete each curve,
 * simulated at the latest block from an address the RPC funds (a state
 * override). A curve whose graduating buy would revert can't graduate,
 * and every real buyer who tries to finish it fails, so each is a lasting
 * critical condition until the simulation passes again.
 */
export function dryRunAlerts(results: ReadonlyArray<{ token: Address; progressBps: number; reply: RpcReply }>, ctx: AlertContext, rpcHint: string): { alerts: Alert[]; evaluated: string[] } {
  const alerts: Alert[] = [];
  const evaluated: string[] = [];
  let answered = false;
  let unavailable: string | null = null;
  for (const { token, progressBps, reply } of results) {
    const reverted = "error" in reply && (reply.error.code === 3 || /revert/i.test(reply.error.message));
    if ("error" in reply && !reverted) {
      unavailable = plain(reply.error.message);
      continue;
    }
    answered = true;
    evaluated.push(`dryrun:${token}`);
    let passed = false;
    if (!("error" in reply)) {
      try {
        passed = decodeFunctionResult({ abi: LAUNCHPAD_VIEWS, functionName: "buy", data: reply.result as Hex }) > ZERO;
      } catch {
        passed = false;
      }
    }
    if (passed) continue;
    alerts.push({
      key: `dryrun:${token}`,
      severity: "critical",
      condition: true,
      title: `Graduation of ${ctx.token(token)} would revert`,
      lines: [
        `A buy that completes its curve (${(progressBps / 100).toFixed(1)}% sold) fails: ${plain(revertReason(reply)) || "it returned no tokens"}.`,
        "Every buyer who tries to finish this curve will fail, and its ETH stays on the curve.",
      ],
    });
  }
  if (answered) evaluated.push("dryrun-unavailable");
  if (unavailable !== null && !answered) {
    alerts.push({ key: "dryrun-unavailable", severity: "warning", condition: true, title: "Graduation dry runs aren't working", lines: [`The RPC refused the simulated buy: ${unavailable}.`, rpcHint] });
  }
  return { alerts, evaluated };
}
