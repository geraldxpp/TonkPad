"use client";

import { useEffect, useState } from "react";
import { fetchPoolQuote, TonkApiError } from "@/shared/tonk/api";
import type { TradeSide } from "@/shared/tonk/mission";
import type { PoolQuoteJson } from "@/shared/tonk/pool";

/** Asked once typing pauses, then kept fresh while the amount stays. */
const DEBOUNCE_MS = 400;
const REFRESH_MS = 15_000;

export interface PoolQuoteState {
  quote: PoolQuoteJson | null;
  /** Why there is no quote: "pending", "curve", "refused", "busy", "unavailable"… */
  error: string | null;
  loading: boolean;
}

interface Answer {
  key: string;
  quote: PoolQuoteJson | null;
  error: string | null;
}

/**
 * What a graduated token's pool gives for the typed amount: Uniswap's own
 * V4Quoter, asked through the server. Only the answer for the amount and
 * side on screen is ever shown.
 */
export function usePoolQuote(token: string, side: TradeSide, amount: bigint | null): PoolQuoteState {
  const [answer, setAnswer] = useState<Answer>({ key: "", quote: null, error: null });
  const key = amount !== null && amount > BigInt(0) ? `${token}:${side}:${amount}` : "";
  useEffect(() => {
    if (!key || amount === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      try {
        const quote = await fetchPoolQuote(token, side, String(amount), controller.signal);
        setAnswer({ key, quote, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        // A failed refresh keeps the last quote for this amount, and says why.
        setAnswer((last) => ({ key, quote: last.key === key ? last.quote : null, error: error instanceof TonkApiError ? error.code : "unavailable" }));
      }
      if (!controller.signal.aborted) timer = setTimeout(ask, REFRESH_MS);
    };
    timer = setTimeout(ask, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, token, side, amount]);
  const current = key !== "" && answer.key === key;
  return { quote: current ? answer.quote : null, error: current ? answer.error : null, loading: key !== "" && !current };
}
