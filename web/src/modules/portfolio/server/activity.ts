import { SOL_MINT } from "@/shared/swap/tokens";
import { explorerTx } from "@/shared/swap/tokens";
import type { ActivityLeg, ActivityPage, ActivityType, PortfolioActivity } from "../lib/types";
import { numeric, record } from "./clean";
import { readSolanaTokens, type SolanaTokenInfo } from "./jupiter";

const ENHANCED = "https://api-mainnet.helius-rpc.com/v0/addresses";
const PAGE = 40;
/** Pages read for one answer: a spammed wallet can fill whole pages with nothing worth showing. */
const MAX_ROUNDS = 4;
/** Enough to show; further reads wait for "Load more". */
const ENOUGH = 15;
/** SOL moves this small beside a token transfer are rent, tips and fees, not part of the trade. */
const SOL_NOISE = 0.01;
/** Airdropped specks of SOL, sent to get a phishing memo into a wallet's history. */
const SOL_DUST = 0.0001;

/** What a set of legs amounts to; null when nothing moved. */
export function activityType(received: readonly unknown[], sent: readonly unknown[]): ActivityType | null {
  if (received.length > 0 && sent.length > 0) return "swap";
  if (received.length > 0) return "receive";
  return sent.length > 0 ? "send" : null;
}

const biggestFirst = (legs: ActivityLeg[]) => legs.sort((a, b) => b.amount - a.amount);

/** The wallet's net change in SOL, with the fee it paid put back: the fee isn't a transfer. */
function netSol(tx: Record<string, unknown>, owner: string): number {
  const entries = Array.isArray(tx.accountData) ? tx.accountData : [];
  const own = entries.find((entry) => record(entry) && entry.account === owner);
  const change = record(own) ? (numeric(own.nativeBalanceChange) ?? 0) : 0;
  return (change + (tx.feePayer === owner ? (numeric(tx.fee) ?? 0) : 0)) / 1e9;
}

/** The wallet's net change per mint, across all of its token accounts. */
function netTokens(tx: Record<string, unknown>, owner: string): Map<string, number> {
  const net = new Map<string, number>();
  for (const entry of Array.isArray(tx.accountData) ? tx.accountData : []) {
    for (const change of record(entry) && Array.isArray(entry.tokenBalanceChanges) ? entry.tokenBalanceChanges : []) {
      if (!record(change) || change.userAccount !== owner || typeof change.mint !== "string" || !record(change.rawTokenAmount)) continue;
      const raw = numeric(change.rawTokenAmount.tokenAmount);
      const decimals = numeric(change.rawTokenAmount.decimals);
      if (raw !== null && decimals !== null) net.set(change.mint, (net.get(change.mint) ?? 0) + raw / 10 ** decimals);
    }
  }
  return net;
}

/** Who the coins came from or went to, from the transaction's own transfer lists. */
function counterpartyOf(tx: Record<string, unknown>, owner: string, type: ActivityType): string | null {
  if (type === "swap") return null;
  const transfers = [...(Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : []), ...(Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers : [])];
  const [ours, theirs] = type === "send" ? ["fromUserAccount", "toUserAccount"] : ["toUserAccount", "fromUserAccount"];
  for (const transfer of transfers) {
    if (record(transfer) && transfer[ours] === owner && typeof transfer[theirs] === "string" && transfer[theirs] && transfer[theirs] !== owner) return transfer[theirs];
  }
  return null;
}

/**
 * One enhanced transaction from the wallet's point of view: what it gained
 * and lost, net. Anything that moved nothing of the wallet's is dropped, and
 * so are airdrops of tokens with no market and specks of SOL: wallets are
 * spammed with both, to get a scam's name into their history.
 */
export function solanaActivity(raw: unknown, owner: string, tokens: ReadonlyMap<string, SolanaTokenInfo>): PortfolioActivity | null {
  if (!record(raw) || typeof raw.signature !== "string") return null;
  const time = numeric(raw.timestamp);
  if (time === null) return null;
  const failed = raw.transactionError !== null && raw.transactionError !== undefined;
  // A failed transaction moved nothing, and is only the wallet's business if the wallet paid for it.
  if (failed && raw.feePayer !== owner) return null;

  const received: ActivityLeg[] = [];
  const sent: ActivityLeg[] = [];
  const net = netTokens(raw, owner);
  let unknownReceived = 0;
  for (const [mint, amount] of net) {
    if (amount === 0) continue;
    const info = tokens.get(mint);
    if (amount > 0 && !info?.priceUsd) unknownReceived += 1;
    (amount > 0 ? received : sent).push({ symbol: mint === SOL_MINT ? "WSOL" : (info?.symbol ?? mint.slice(0, 5).toUpperCase()), amount: Math.abs(amount) });
  }
  const sol = netSol(raw, owner);
  const moved = net.size > 0;
  if (Math.abs(sol) >= (moved ? SOL_NOISE : SOL_DUST)) (sol > 0 ? received : sent).push({ symbol: "SOL", amount: Math.abs(sol) });

  const type = activityType(received, sent);
  if (!failed && (type === null || (type === "receive" && unknownReceived === received.length))) return null;
  return {
    id: raw.signature,
    chain: "sol",
    type: type ?? "send",
    time: time * 1000,
    failed,
    received: biggestFirst(received),
    sent: biggestFirst(sent),
    counterparty: type ? counterpartyOf(raw, owner, type) : null,
    url: explorerTx("sol", raw.signature),
  };
}

/** Every mint a page of transactions moved for the wallet, so they can be named in one lookup. */
function mintsOf(page: readonly unknown[], owner: string): string[] {
  return [...new Set(page.flatMap((tx) => (record(tx) ? [...netTokens(tx, owner).keys()] : [])))];
}

/** A page of a Solana wallet's history, newest first, from Helius's parsed transactions. */
export async function readSolanaActivity(owner: string, cursor: string | null): Promise<ActivityPage> {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) throw new Error("no Helius key");
  const items: PortfolioActivity[] = [];
  let next = cursor;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const query = new URLSearchParams({ "api-key": apiKey, limit: String(PAGE) });
    if (next) query.set("before-signature", next);
    const res = await fetch(`${ENHANCED}/${owner}/transactions?${query}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    // The URL carries the key, so errors name only the status.
    if (!res.ok) throw new Error(`Helius transactions: HTTP ${res.status}`);
    const page: unknown = await res.json();
    if (!Array.isArray(page)) throw new Error("Helius transactions: bad response");
    const { tokens } = await readSolanaTokens(mintsOf(page, owner));
    items.push(...page.flatMap((tx) => solanaActivity(tx, owner, tokens) ?? []));
    const last: unknown = page[page.length - 1];
    next = page.length === PAGE && record(last) && typeof last.signature === "string" ? last.signature : null;
    if (next === null || items.length >= ENOUGH) break;
  }
  return { chain: "sol", owner, items, next };
}
