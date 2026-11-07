import { PONS_SUPPLY, type PonsState } from "./curve";

/**
 * Pons wallet balances from curve trades (the owner's approved fallback until
 * Blockscout). Buys credit the recipient: routers name the user there. Sells
 * debit the seller, or the recipient when a router sold on the user's behalf.
 * Exact while the token is on its curve, except for transfers between
 * wallets; tracking stops at graduation. Tokens launched before tracking
 * began have no balances, so they get no count.
 */

/** Below one token a wallet holds dust, not the token. */
const DUST = 1;
/** First buyers remembered per token; smart money credits them when it graduates (the creator is left out then). */
export const EARLY_BUYERS = 20;

export interface WalletTrade {
  buy: boolean;
  trader: string;
  recipient: string;
  /** Whole tokens. */
  tokens: number;
}

export function trackHolders(s: PonsState, trade: WalletTrade): void {
  const balances = s.balances;
  if (!balances) return;
  if (trade.buy) {
    balances[trade.recipient] = (balances[trade.recipient] ?? 0) + trade.tokens;
    const early = s.earlyBuyers;
    if (early && early.length <= EARLY_BUYERS && !early.includes(trade.recipient)) early.push(trade.recipient);
    return;
  }
  const seller = (balances[trade.trader] ?? 0) > 0 ? trade.trader : trade.recipient;
  const left = (balances[seller] ?? 0) - trade.tokens;
  if (left > DUST) balances[seller] = left;
  else delete balances[seller];
}

export interface PonsHolders {
  count: number;
  /** Share of supply the 10 largest wallets hold, 0–1. */
  top10Share: number;
}

/** Holders and the top-10 share, or null when the token wasn't tracked from launch. */
export function ponsHolders(s: PonsState): PonsHolders | null {
  if (!s.balances) return null;
  const amounts = Object.values(s.balances)
    .filter((amount) => amount > DUST)
    .sort((a, b) => b - a);
  const top10 = amounts.slice(0, 10).reduce((sum, amount) => sum + amount, 0);
  return { count: amounts.length, top10Share: Math.min(1, top10 / PONS_SUPPLY) };
}
