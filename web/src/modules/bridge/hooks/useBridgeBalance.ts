"use client";

import { sameAddress } from "@/shared/lib/address";
import { usePolling } from "@/shared/live/usePolling";
import { isRawAmount, type RawAmount } from "@/shared/wallet/units";
import { balancePath } from "../lib/api";
import type { BridgeAsset, BridgeNetwork } from "../lib/networks";

const REFRESH_MS = 15_000;

interface BalanceAnswer {
  network: string;
  owner: string;
  native: RawAmount;
  token: RawAmount | null;
}

const isAnswer = (value: unknown, network: string, owner: string): value is BalanceAnswer => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return body.network === network && typeof body.owner === "string" && sameAddress(body.owner, owner) && isRawAmount(body.native) && (body.token === null || isRawAmount(body.token));
};

export interface BalanceView {
  /** Base units of the asset; null until read. */
  amount: string | null;
  /** Base units of the network's coin; null until read. */
  coin: string | null;
}

/** A wallet's holding of an asset and of the network's coin, refreshed while the tab is visible. */
export function useBridgeBalance(network: BridgeNetwork, asset: BridgeAsset | null, owner: string | null): BalanceView {
  const symbol = asset && !asset.native ? asset.symbol : null;
  const { data } = usePolling<unknown>(owner ? balancePath(network.id, owner, symbol) : null, null, REFRESH_MS);
  if (!owner || !isAnswer(data, network.id, owner)) return { amount: null, coin: null };
  if (symbol && data.token === null) return { amount: null, coin: data.native.raw };
  return { amount: symbol && data.token ? data.token.raw : data.native.raw, coin: data.native.raw };
}
