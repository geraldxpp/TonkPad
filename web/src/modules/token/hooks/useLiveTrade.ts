"use client";

import { useEffect, useState } from "react";
import { parseAmount } from "@/shared/swap/amounts";
import { fetchToken, type QuoteRequest } from "@/shared/swap/api";
import { useSlippage } from "@/shared/swap/slippage";
import { useTradingOpen } from "@/shared/swap/useTradingOpen";
import { nativeToken } from "@/shared/swap/tokens";
import { useQuote } from "@/shared/swap/useQuote";
import type { SwapToken } from "@/shared/types/swap";
import type { TradeToken } from "../components/trade/types";
import type { TradeSide } from "../lib/trade";

/**
 * A live token's real trade: the swap engine's quote for the chain's coin
 * into the token (buy) or the token into the coin (sell). Buys are typed in
 * the coin, sells in millions of tokens, as the panel shows them. The
 * token's decimals are looked up once.
 */
export function useLiveTrade(token: TradeToken, side: TradeSide, amount: string, owner: string | null) {
  const [info, setInfo] = useState<SwapToken | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchToken(token.chain, token.address, controller.signal).then(setInfo, () => {
      if (!controller.signal.aborted) setLookupFailed(true);
    });
    return () => controller.abort();
  }, [token.chain, token.address]);
  const switchOpen = useTradingOpen();

  const [slippageBps] = useSlippage();
  const coin = nativeToken(token.chain);
  const asset: SwapToken | null = info ? { ...info, symbol: token.ticker, name: token.name, icon: token.art || info.icon } : null;
  const buy = side === "buy";
  const raw = asset ? parseAmount(amount, buy ? coin.decimals : asset.decimals + 6) : null;
  const from = buy ? coin : asset;
  const to = buy ? asset : coin;
  const request: QuoteRequest | null =
    from && to && raw ? { chain: token.chain, from: from.address, to: to.address, amount: raw, slippageBps, taker: owner } : null;
  const live = useQuote(request);
  return {
    request,
    // The switch from the latest quote, else from the server's own answer; a token that can't be looked up can't be quoted.
    live: { ...live, tradingOpen: live.tradingOpen ?? switchOpen, error: lookupFailed ? "unavailable" : live.error },
    from,
    to,
    slippageBps,
  };
}
