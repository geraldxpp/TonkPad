import { chainText } from "@/shared/tonk/metadata";
import { explorerTx, USDG, WETH } from "@/shared/swap/tokens";
import { jsonRpc, type RpcCall } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import type { ActivityLeg, ActivityPage, PortfolioActivity } from "../lib/types";
import { activityType } from "./activity";
import { numeric, record } from "./clean";
import { readDexPrices } from "./dex";

const PAGE = 40;
/** Pages read for one answer: a spammed wallet can fill whole pages with nothing worth showing. */
const MAX_ROUNDS = 4;
/** Enough to show; further reads wait for "Load more". */
const ENOUGH = 15;
const CATEGORIES = ["external", "internal", "erc20"] as const;

export interface RobinhoodTransfer {
  hash: string;
  block: number;
  time: number;
  from: string;
  to: string;
  symbol: string;
  amount: number;
  /** The token's contract; null for ETH. */
  contract: string | null;
}

/** One entry of alchemy_getAssetTransfers, or null when it can't be read. */
export function parseTransfer(raw: unknown): RobinhoodTransfer | null {
  if (!record(raw) || typeof raw.hash !== "string" || typeof raw.blockNum !== "string" || !/^0x[\da-fA-F]+$/.test(raw.blockNum)) return null;
  const when = record(raw.metadata) && typeof raw.metadata.blockTimestamp === "string" ? Date.parse(raw.metadata.blockTimestamp) : NaN;
  const amount = numeric(raw.value);
  if (!Number.isFinite(when) || amount === null || amount <= 0 || typeof raw.from !== "string" || typeof raw.to !== "string") return null;
  const contract = record(raw.rawContract) && typeof raw.rawContract.address === "string" ? raw.rawContract.address.toLowerCase() : null;
  return {
    hash: raw.hash,
    block: Number(BigInt(raw.blockNum)),
    time: when,
    from: raw.from.toLowerCase(),
    to: raw.to.toLowerCase(),
    symbol: chainText(raw.asset, 12) || (contract ? contract.slice(2, 7).toUpperCase() : "ETH"),
    amount,
    contract,
  };
}

/**
 * A transaction's transfers from the wallet's point of view, net per asset.
 * Airdrops of tokens with no market are dropped: `known` says which contracts
 * have one.
 */
export function robinhoodActivity(transfers: readonly RobinhoodTransfer[], owner: string, known: ReadonlySet<string>): PortfolioActivity | null {
  const [first] = transfers;
  if (!first) return null;
  const me = owner.toLowerCase();
  const net = new Map<string, { symbol: string; amount: number; contract: string | null }>();
  for (const transfer of transfers) {
    const delta = (transfer.to === me ? transfer.amount : 0) - (transfer.from === me ? transfer.amount : 0);
    const key = transfer.contract ?? "eth";
    const held = net.get(key) ?? { symbol: transfer.symbol, amount: 0, contract: transfer.contract };
    net.set(key, { ...held, amount: held.amount + delta });
  }
  const received: ActivityLeg[] = [];
  const sent: ActivityLeg[] = [];
  let unknownReceived = 0;
  for (const { symbol, amount, contract } of net.values()) {
    if (amount === 0) continue;
    if (amount > 0 && contract && !known.has(contract)) unknownReceived += 1;
    (amount > 0 ? received : sent).push({ symbol, amount: Math.abs(amount) });
  }
  const type = activityType(received, sent);
  if (type === null || (type === "receive" && unknownReceived === received.length)) return null;
  const other = type === "swap" ? null : (transfers.find((transfer) => (type === "send" ? transfer.from === me : transfer.to === me)) ?? null);
  return {
    id: first.hash,
    chain: "rh",
    type,
    time: first.time,
    failed: false,
    received: received.sort((a, b) => b.amount - a.amount),
    sent: sent.sort((a, b) => b.amount - a.amount),
    counterparty: other ? (type === "send" ? other.to : other.from) : null,
    url: explorerTx("rh", first.hash),
  };
}

type Direction = "fromAddress" | "toAddress";

async function transfersOf(rpc: RpcCall, owner: string, direction: Direction, toBlock: string): Promise<{ list: RobinhoodTransfer[]; full: boolean }> {
  const result = await rpc("alchemy_getAssetTransfers", [{ fromBlock: "0x0", toBlock, [direction]: owner, category: CATEGORIES, withMetadata: true, excludeZeroValue: true, maxCount: `0x${PAGE.toString(16)}`, order: "desc" }]);
  const raw = record(result) && Array.isArray(result.transfers) ? result.transfers : [];
  return { list: raw.flatMap((entry) => parseTransfer(entry) ?? []), full: record(result) && typeof result.pageKey === "string" && result.pageKey !== "" };
}

/**
 * Where to cut a page read from two streams (sent and received), each newest
 * first and each cut off at its own depth: everything newer than the deeper
 * of the two ends is complete. The cut block is read again on the next page.
 */
export function cutBlock(sent: { list: readonly RobinhoodTransfer[]; full: boolean }, received: { list: readonly RobinhoodTransfer[]; full: boolean }): number | null {
  const ends = [sent, received].flatMap(({ list, full }) => (full && list.length > 0 ? [list[list.length - 1].block] : []));
  return ends.length > 0 ? Math.max(...ends) : null;
}

/** One read of both streams from `cursor` back: what it found, and where to read from next. */
async function readRound(rpc: RpcCall, owner: string, cursor: string | null): Promise<{ items: PortfolioActivity[]; next: string | null }> {
  const toBlock = cursor && /^\d+$/.test(cursor) ? `0x${Number(cursor).toString(16)}` : "latest";
  const [sent, received] = await Promise.all([transfersOf(rpc, owner, "fromAddress", toBlock), transfersOf(rpc, owner, "toAddress", toBlock)]);
  const cut = cutBlock(sent, received);
  const all = [...sent.list, ...received.list];
  // One block holding a whole page can't be split by block: take it all and step past it.
  const allOneBlock = cut !== null && all.every((transfer) => transfer.block === cut);
  const kept = cut === null || allOneBlock ? all : all.filter((transfer) => transfer.block > cut);
  const byHash = new Map<string, RobinhoodTransfer[]>();
  for (const transfer of kept) byHash.set(transfer.hash, [...(byHash.get(transfer.hash) ?? []), transfer]);
  // A self-send appears in both streams: the same log counted twice would cancel out wrongly.
  for (const [hash, list] of byHash) byHash.set(hash, list.filter((transfer, index) => list.findIndex((other) => other.from === transfer.from && other.to === transfer.to && other.amount === transfer.amount && other.contract === transfer.contract) === index));

  const contracts = [...new Set(kept.flatMap((transfer) => (transfer.contract ? [transfer.contract] : [])))];
  const { prices } = await readDexPrices(contracts);
  const known = new Set([...prices.keys(), USDG.toLowerCase(), WETH.toLowerCase()]);
  const items = [...byHash.values()].flatMap((transfers) => robinhoodActivity(transfers, owner, known) ?? []).sort((a, b) => b.time - a.time);
  return { items, next: cut === null ? null : String(allOneBlock ? cut - 1 : cut) };
}

/** A page of a Robinhood Chain wallet's history, newest first. The cursor is the block to read back from. */
export async function readRobinhoodActivity(owner: string, cursor: string | null, rpc: RpcCall = jsonRpc(walletRpcUrl("rh"))): Promise<ActivityPage> {
  const items: PortfolioActivity[] = [];
  let next = cursor;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const page = await readRound(rpc, owner, next);
    items.push(...page.items);
    next = page.next;
    if (next === null || items.length >= ENOUGH) break;
  }
  return { chain: "rh", owner, items, next };
}
