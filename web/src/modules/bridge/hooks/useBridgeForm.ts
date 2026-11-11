"use client";

import { useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { parseAmount } from "@/shared/swap/amounts";
import { arrivalAsset, assetOf, type BridgeAsset, type BridgeNetwork, networkOf } from "../lib/networks";
import { safeReturn } from "../lib/view";

const DEFAULT = { from: "base", to: "rh", asset: "USDC" };

export interface BridgeForm {
  from: BridgeNetwork;
  to: BridgeNetwork;
  asset: BridgeAsset;
  receive: BridgeAsset;
  amount: string;
  /** The amount in base units; null when there's nothing to send. */
  raw: string | null;
  /** The route picked, by id; null to take the suggested one. */
  routeId: string | null;
  /** Where to lead once it has arrived. */
  returnTo: string | null;
  custom: boolean;
  customAddress: string;
  gas: boolean;
  setNetwork: (side: "from" | "to", id: string) => void;
  setAsset: (side: "from" | "to", symbol: string) => void;
  reverse: () => void;
  setAmount: (text: string) => void;
  setRoute: (id: string) => void;
  setCustom: (on: boolean) => void;
  setCustomAddress: (text: string) => void;
  setGas: (on: boolean) => void;
}

/** The transfer as the URL describes it, falling back to the default route for anything it doesn't know. */
export function parseForm(params: Pick<URLSearchParams, "get">) {
  let from = networkOf(params.get("from")) ?? (networkOf(DEFAULT.from) as BridgeNetwork);
  let to = networkOf(params.get("to")) ?? (networkOf(DEFAULT.to) as BridgeNetwork);
  if (from.id === to.id) {
    if (params.get("from")) to = (networkOf(from.id === DEFAULT.to ? DEFAULT.from : DEFAULT.to) as BridgeNetwork);
    else from = (networkOf(to.id === DEFAULT.from ? DEFAULT.to : DEFAULT.from) as BridgeNetwork);
  }
  const asset = assetOf(from, params.get("asset")) ?? assetOf(from, DEFAULT.asset) ?? from.assets[0];
  const receive = assetOf(to, params.get("receive")) ?? arrivalAsset(asset, to);
  return { from, to, asset, receive, routeId: params.get("route"), returnTo: safeReturn(params.get("return")) };
}

/**
 * The bridge's inputs. The route lives in the URL (?from=base&to=rh&asset=USDC&receive=USDG&route=across),
 * so a transfer can be shared; the amount, destination and gas choice stay in the page.
 */
export function useBridgeForm(): BridgeForm {
  const { params, setParams } = useUrlParams();
  const view = parseForm(params);
  const { from, to, asset, receive } = view;
  const [amount, setAmount] = useState("");
  const [custom, setCustom] = useState(false);
  const [customAddress, setCustomAddress] = useState("");
  const [gas, setGas] = useState(false);

  /** Writes a new route, keeping what can carry over and dropping the rest. */
  const write = (nextFrom: BridgeNetwork, nextTo: BridgeNetwork, nextAsset: BridgeAsset, nextReceive: BridgeAsset) => {
    if (nextFrom.vm !== from.vm || nextTo.vm !== to.vm) setCustomAddress("");
    if (nextAsset.family !== asset.family || nextAsset.decimals !== asset.decimals) setAmount("");
    setParams({ from: nextFrom.id, to: nextTo.id, asset: nextAsset.symbol, receive: nextReceive.symbol, route: null });
  };

  return {
    ...view,
    amount,
    raw: parseAmount(amount, asset.decimals),
    custom,
    customAddress,
    gas,
    setNetwork(side, id) {
      const network = networkOf(id);
      if (!network) return;
      // Picking the other end's network turns the route around.
      const swapped = side === "from" ? network.id === to.id : network.id === from.id;
      const nextFrom = side === "from" ? network : swapped ? to : from;
      const nextTo = side === "to" ? network : swapped ? from : to;
      const nextAsset = assetOf(nextFrom, asset.symbol) ?? (nextFrom.assets.find((item) => item.family === asset.family && asset.family !== "coin") ?? nextFrom.assets[0]);
      write(nextFrom, nextTo, nextAsset, arrivalAsset(nextAsset, nextTo));
    },
    setAsset(side, symbol) {
      if (side === "to") {
        const next = assetOf(to, symbol);
        if (next) setParams({ receive: next.symbol, route: null });
        return;
      }
      const next = assetOf(from, symbol);
      if (next) write(from, to, next, arrivalAsset(next, to));
    },
    reverse() {
      write(to, from, receive, asset);
    },
    setAmount,
    setRoute: (id) => setParams({ route: id }),
    setCustom,
    setCustomAddress,
    setGas,
  };
}
