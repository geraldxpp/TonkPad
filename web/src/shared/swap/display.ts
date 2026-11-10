import type { ChainId } from "@/shared/types/chain";
import type { SwapQuote, SwapToken } from "@/shared/types/swap";
import { toUnits } from "@/shared/wallet/units";
import { formatCompact, formatFull, formatUsdValue, unitRate } from "./amounts";
import { nativeToken, sameAddress } from "./tokens";

/** The quote's numbers as the swap card and the review show them. */
export interface QuoteView {
  out: string;
  outCompact: string;
  minOut: string;
  inUsd: string | null;
  outUsd: string | null;
  /** "85.96" (USDC per SOL): one whole input in output units. */
  rate: string | null;
  /** "1%" and its amount ("0.001 SOL"), or null when no fee is taken. */
  fee: { pct: string; amount: string } | null;
  /** "0.000005 SOL", or null when unknown. */
  network: string | null;
  /** "0.12%", or null when the provider doesn't say. */
  impact: string | null;
  route: string;
}

export const pctText = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** The token a fee or amount is counted in, among the two being swapped (or the chain's coin). */
function tokenFor(chain: ChainId, address: string, from: SwapToken, to: SwapToken): SwapToken {
  if (sameAddress(chain, address, from.address)) return from;
  if (sameAddress(chain, address, to.address)) return to;
  return nativeToken(chain);
}

export function quoteView(quote: SwapQuote, from: SwapToken, to: SwapToken): QuoteView {
  const out = { raw: quote.outAmount, decimals: to.decimals };
  const rate = unitRate({ raw: quote.inAmount, decimals: from.decimals }, out);
  const coin = nativeToken(quote.chain);
  // 0x reports native ETH as 0xeeee…; Jupiter's fee token is the mint itself.
  const feeToken = quote.fee ? tokenFor(quote.chain, quote.fee.token.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ? coin.address : quote.fee.token, from, to) : null;
  return {
    out: formatFull(out),
    outCompact: formatCompact(out),
    minOut: formatFull({ raw: quote.minOut, decimals: to.decimals }),
    inUsd: formatUsdValue(quote.inUsd),
    outUsd: formatUsdValue(quote.outUsd),
    // Full figures read best below a million ("2,095.48"); past that, "58.63M".
    rate: rate ? (toUnits(rate) < 1e6 ? formatFull(rate) : formatCompact(rate)) : null,
    fee: quote.fee && feeToken ? { pct: pctText(quote.fee.bps), amount: `${formatFull({ raw: quote.fee.amount, decimals: feeToken.decimals })} ${feeToken.symbol}` } : null,
    network: quote.networkFee ? `${formatFull({ raw: quote.networkFee, decimals: coin.decimals })} ${coin.symbol}` : null,
    impact: quote.priceImpact === null ? null : `${(quote.priceImpact * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`,
    route: quote.route.length ? quote.route.join(" → ") : quote.provider === "jupiter" ? "Jupiter" : "0x",
  };
}
