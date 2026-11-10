"use client";

import { useEffect, useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { isChainId } from "@/shared/config/chains";
import { isChainAddress } from "@/shared/lib/address";
import { parseAmount } from "@/shared/swap/amounts";
import { fetchToken } from "@/shared/swap/api";
import { useSlippage } from "@/shared/swap/slippage";
import { baseToken, DEFAULT_PAIR, sameAddress } from "@/shared/swap/tokens";
import type { ChainId } from "@/shared/types/chain";
import type { SwapToken } from "@/shared/types/swap";

const keyOf = (chain: ChainId, address: string) => `${chain}:${chain === "rh" ? address.toLowerCase() : address}`;

export interface SwapForm {
  chain: ChainId;
  /** Null while a pasted or listed token's decimals are being looked up. */
  from: SwapToken | null;
  to: SwapToken | null;
  /** The pair's addresses, known even before the tokens resolve. */
  fromAddress: string;
  toAddress: string;
  /** The typed amount, and the same in base units (null when there's nothing to trade). */
  amount: string;
  raw: string | null;
  slippageBps: number;
  /** A token address that couldn't be looked up. */
  unknown: string | null;
  setChain: (chain: ChainId) => void;
  setAmount: (text: string) => void;
  pick: (side: "from" | "to", token: SwapToken) => void;
  flip: () => void;
  setSlippage: (bps: number) => void;
}

/**
 * The swap's inputs. The network and pair live in the URL (?chain=sol&from=…&to=…)
 * so a swap can be shared; the amount stays in the page and the slippage in
 * this browser. Tokens beyond the base coins are looked up once for their decimals.
 */
export function useSwapForm(): SwapForm {
  const { params, setParams } = useUrlParams();
  const chainParam = params.get("chain");
  const chain: ChainId = isChainId(chainParam) ? chainParam : "sol";
  const [defaultFrom, defaultTo] = DEFAULT_PAIR[chain];
  const valid = (address: string | null) => (address && isChainAddress(chain, address) ? address : null);
  let fromAddress = valid(params.get("from")) ?? defaultFrom;
  let toAddress = valid(params.get("to")) ?? defaultTo;
  if (sameAddress(chain, fromAddress, toAddress)) [fromAddress, toAddress] = [defaultFrom, defaultTo];

  const [known, setKnown] = useState<Record<string, SwapToken>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [amount, setAmountText] = useState("");
  const [slippageBps, setSlippage] = useSlippage();

  const resolve = (address: string) => baseToken(chain, address) ?? known[keyOf(chain, address)] ?? null;
  const from = resolve(fromAddress);
  const to = resolve(toAddress);

  useEffect(() => {
    const missing = [fromAddress, toAddress].filter((address) => !baseToken(chain, address) && !known[keyOf(chain, address)] && !failed[keyOf(chain, address)]);
    if (!missing.length) return;
    const controller = new AbortController();
    for (const address of missing) {
      fetchToken(chain, address, controller.signal).then(
        (token) => setKnown((was) => ({ ...was, [keyOf(chain, address)]: token })),
        () => {
          if (!controller.signal.aborted) setFailed((was) => ({ ...was, [keyOf(chain, address)]: true }));
        },
      );
    }
    return () => controller.abort();
  }, [chain, fromAddress, toAddress, known, failed]);

  const pair = (nextFrom: string, nextTo: string) => setParams({ from: nextFrom, to: nextTo });
  return {
    chain,
    from,
    to,
    fromAddress,
    toAddress,
    amount,
    raw: from ? parseAmount(amount, from.decimals) : null,
    slippageBps,
    unknown: [fromAddress, toAddress].find((address) => failed[keyOf(chain, address)]) ?? null,
    setChain(next) {
      if (next === chain) return;
      setAmountText("");
      setParams({ chain: next === "sol" ? null : next, from: null, to: null });
    },
    setAmount: setAmountText,
    pick(side, token) {
      if (!baseToken(chain, token.address)) setKnown((was) => ({ ...was, [keyOf(chain, token.address)]: token }));
      const other = side === "from" ? toAddress : fromAddress;
      // Picking the other side's token turns the pair around.
      if (sameAddress(chain, token.address, other)) return pair(toAddress, fromAddress);
      return side === "from" ? pair(token.address, toAddress) : pair(fromAddress, token.address);
    },
    flip: () => pair(toAddress, fromAddress),
    setSlippage,
  };
}
