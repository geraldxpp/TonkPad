/**
 * The trade panel's maths, as the export simulates it (phase 1: no wallet,
 * no quotes). Buys are typed in the chain's coin, sells in millions of tokens.
 */

export type TradeSide = "buy" | "sell";

/** The export's slippage, used for the "Min." line. */
export const SLIPPAGE = 0.15;

/** Preset amounts: the chain's coin when buying, millions of tokens when selling. Max is added after. */
export const PRESETS: Record<TradeSide, readonly string[]> = {
  buy: ["0.01", "0.05", "0.1", "0.5"],
  sell: ["0.5", "1", "2", "3"],
};

/** The amount each side opens with. */
export const START_AMOUNT: Record<TradeSide, string> = { buy: "0.05", sell: "1" };

/** The simulated wallet: nothing on the token's chain yet (so the bridge banner shows) and 3.13M tokens to sell. */
export const SIM_WALLET = { native: 0, tokensM: 3.13 } as const;

/** Token amounts the export's way: "2.93M", "784.0K", "512". */
export function formatTokens(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

/** A balance without trailing zeros: 0.25, 0, 1.2345. */
export const plainAmount = (value: number) => String(+value.toFixed(4));

export interface TradeInput {
  side: TradeSide;
  /** What the user typed. */
  amount: string;
  /** The chain's coin in the wallet. */
  balance: number;
  /** Tokens held, in millions. */
  holdingM: number;
  priceUsd: number;
  nativeUsd: number;
}

export interface TradeQuote {
  amount: number;
  /** Tokens for a buy, the chain's coin for a sell. */
  receive: number;
  /** `receive` less the slippage allowance. */
  minimum: number;
  /** The USD value of what is paid. */
  payUsd: number;
  /** Why the trade can't go ahead, or null when it can. */
  blocked: "enter" | "short" | "shortToken" | null;
  /** The bridge banner shows while a buy needs more coin than the wallet has. */
  needsFunds: boolean;
}

export function quoteTrade({ side, amount, balance, holdingM, priceUsd, nativeUsd }: TradeInput): TradeQuote {
  const parsed = Number.parseFloat(amount);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const buy = side === "buy";
  const payUsd = buy ? value * nativeUsd : value * 1e6 * priceUsd;
  const receive = buy ? (priceUsd > 0 ? payUsd / priceUsd : 0) : nativeUsd > 0 ? payUsd / nativeUsd : 0;
  const short = buy ? value > balance + 1e-9 : value > holdingM + 1e-9;
  return {
    amount: value,
    receive,
    minimum: receive * (1 - SLIPPAGE),
    payUsd,
    blocked: value <= 0 ? "enter" : short ? (buy ? "short" : "shortToken") : null,
    needsFunds: buy && (balance === 0 || value > balance),
  };
}
