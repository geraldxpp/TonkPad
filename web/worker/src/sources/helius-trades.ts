/**
 * A Solana token's recent trades through Helius's getTransactionsForAddress
 * (10 credits per 100 transactions, 10 at least). Each transaction is read
 * from the balances it changed: the wallet that paid the fee gained the token
 * and spent SOL (a buy), or the reverse (a sell). That works the same on
 * pump.fun's curve, PumpSwap, Raydium and Meteora, and through Jupiter.
 */
import type { TradeRecord } from "../trades/book";

const WSOL = "So11111111111111111111111111111111111111112";
/** Dollar stablecoins some pools trade against: USDC, USDT, USD1. */
const STABLES = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
]);
/** Rent for a token account, paid when a buy opens one and refunded when a sell closes it. */
const TOKEN_ACCOUNT_RENT = 0.00203928;
const LAMPORTS = 1e9;

interface TokenBalance {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { amount?: string; decimals?: number };
}

export interface HeliusTransaction {
  slot?: number;
  blockTime?: number | null;
  transaction?: { signatures?: string[]; message?: { accountKeys?: unknown[] } };
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
}

function held(balances: TokenBalance[] | null | undefined, owner: string, mint: string): { amount: number; open: boolean } {
  let amount = 0;
  let open = false;
  for (const b of balances ?? []) {
    if (b.owner !== owner || b.mint !== mint) continue;
    open = true;
    const raw = Number(b.uiTokenAmount?.amount ?? 0);
    amount += raw / 10 ** (b.uiTokenAmount?.decimals ?? 0);
  }
  return { amount, open };
}

/** The fee payer's buy or sell of `mint` in one transaction, or null when it wasn't one. */
export function parseTrade(tx: HeliusTransaction, mint: string, solUsd: number | null): Omit<TradeRecord, "marketCap"> | null {
  const meta = tx.meta;
  const id = tx.transaction?.signatures?.[0];
  const payer = tx.transaction?.message?.accountKeys?.[0];
  if (!meta || meta.err || typeof id !== "string" || typeof payer !== "string" || typeof tx.blockTime !== "number") return null;

  const before = held(meta.preTokenBalances, payer, mint);
  const after = held(meta.postTokenBalances, payer, mint);
  const tokens = after.amount - before.amount;
  if (Math.abs(tokens) < 1e-9) return null;

  const lamports = (meta.postBalances?.[0] ?? 0) - (meta.preBalances?.[0] ?? 0) + (meta.fee ?? 0);
  // Opening the token account costs rent on a buy; closing it refunds rent on a sell. Neither is part of the price.
  const rent = (!before.open && after.open ? -TOKEN_ACCOUNT_RENT : 0) + (before.open && !after.open ? TOKEN_ACCOUNT_RENT : 0);
  const wsol = held(meta.postTokenBalances, payer, WSOL).amount - held(meta.preTokenBalances, payer, WSOL).amount;
  const sol = lamports / LAMPORTS - rent + wsol;
  let stable = 0;
  for (const coin of STABLES) stable += held(meta.postTokenBalances, payer, coin).amount - held(meta.preTokenBalances, payer, coin).amount;

  const buy = tokens > 0;
  // A buy pays out (SOL or dollars) and a sell takes in; anything else is a transfer, not a trade.
  const paid = buy ? Math.max(0, -sol) : Math.max(0, sol);
  const paidUsd = buy ? Math.max(0, -stable) : Math.max(0, stable);
  if (paid < 1e-9 && paidUsd < 1e-6) return null;
  const native = paid > 1e-9 ? paid : solUsd ? paidUsd / solUsd : 0;
  const usd = paidUsd > 1e-6 ? paidUsd : solUsd ? paid * solUsd : null;
  return { id, tx: id, at: tx.blockTime * 1000, side: buy ? "buy" : "sell", wallet: payer, tokens: Math.abs(tokens), native, usd };
}

/** Credits a full-transaction page costs. */
export const pageCredits = (count: number) => Math.max(10, Math.ceil(count / 100) * 10);

export interface MintTrades {
  trades: Array<Omit<TradeRecord, "marketCap">>;
  /** Newest slot seen, to ask only for later ones next time. */
  slot: number | null;
  credits: number;
}

/** The newest `limit` successful transactions touching `mint` (from `fromSlot` on, when given), read as trades. */
export async function fetchMintTrades(apiKey: string, mint: string, fromSlot: number | null, limit: number, solUsd: number | null): Promise<MintTrades> {
  const filters: Record<string, unknown> = { status: "succeeded" };
  if (fromSlot !== null) filters.slot = { gte: fromSlot };
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "trades",
      method: "getTransactionsForAddress",
      params: [mint, { transactionDetails: "full", sortOrder: "desc", limit, encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed", filters }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Helius HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { data?: HeliusTransaction[] }; error?: { message?: string } };
  if (!body.result) throw new Error(`Helius getTransactionsForAddress: ${body.error?.message ?? "no result"}`);
  const data = body.result.data ?? [];
  const trades = data.flatMap((tx) => parseTrade(tx, mint, solUsd) ?? []);
  const slots = data.map((tx) => tx.slot).filter((slot): slot is number => typeof slot === "number");
  return { trades, slot: slots.length ? Math.max(...slots) : fromSlot, credits: pageCredits(data.length) };
}
