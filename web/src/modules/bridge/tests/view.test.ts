import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { isSolanaAddress } from "@/shared/lib/address";
import { BRIDGE_SOURCES } from "@/shared/wallet/bridge-sources";
import { parseForm } from "../hooks/useBridgeForm";
import { checkEvery } from "../hooks/useTrackTransfers";
import { isBuild, isQuote, isStatus } from "../lib/api";
import { arrivalAsset, assetOf, BRIDGE_NETWORKS, type BridgeNetwork, etaParts, explorerTxOf, isNetworkAddress, networkOf, walletChainOf } from "../lib/networks";
import { inFlight, isRecent } from "../lib/recent";
import type { BridgeRoute } from "../lib/types";
import { actionState, type ActionInputs, chosenRoute, etaText, rankRoutes, safeReturn, totalCost } from "../lib/view";

const net = (id: string) => networkOf(id) as BridgeNetwork;
const route = (patch: Partial<BridgeRoute>): BridgeRoute => ({ id: "relay", provider: "relay", name: "Relay", outAmount: "1", minOut: "1", etaSeconds: 6, inUsd: 100, outUsd: 99, feeUsd: 1, networkUsd: 0.1, gasTopUp: null, trustless: false, ...patch });

describe("the network list", () => {
  it("has unique ids and chain ids", () => {
    expect(new Set(BRIDGE_NETWORKS.map((network) => network.id)).size).toBe(BRIDGE_NETWORKS.length);
    expect(new Set(BRIDGE_NETWORKS.map((network) => network.chainId)).size).toBe(BRIDGE_NETWORKS.length);
  });

  it("names every asset by a real address in its network's format", () => {
    for (const network of BRIDGE_NETWORKS) {
      for (const asset of network.assets) {
        if (network.vm === "evm") expect(isAddress(asset.address), `${network.id} ${asset.symbol}`).toBe(true);
        else if (!asset.native) expect(isSolanaAddress(asset.address), asset.symbol).toBe(true);
      }
      expect(network.assets[0].native, network.id).toBe(true);
    }
  });

  it("knows BNB Chain's stablecoins have 18 decimals, unlike everywhere else", () => {
    expect(assetOf(net("bnb"), "USDC")?.decimals).toBe(18);
    expect(assetOf(net("base"), "USDC")?.decimals).toBe(6);
  });

  it("sends a transfer's asset to the closest thing the destination has", () => {
    const usdc = assetOf(net("base"), "USDC");
    const eth = assetOf(net("base"), "ETH");
    const sol = net("sol").assets[0];
    if (!usdc || !eth) throw new Error("missing assets");
    expect(arrivalAsset(usdc, net("rh")).symbol).toBe("USDG");
    expect(arrivalAsset(usdc, net("arb")).symbol).toBe("USDC");
    expect(arrivalAsset(eth, net("rh")).symbol).toBe("ETH");
    expect(arrivalAsset(sol, net("rh")).symbol).toBe("ETH");
  });

  it("checks addresses in the network's own format", () => {
    expect(isNetworkAddress(net("rh"), "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    expect(isNetworkAddress(net("rh"), "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY")).toBe(false);
    expect(isNetworkAddress(net("sol"), "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY")).toBe(true);
  });

  it("is the same list the wallet can switch to", () => {
    const evm = BRIDGE_NETWORKS.filter((network) => network.vm === "evm" && network.id !== "rh").map((network) => network.chainId);
    expect([...evm].sort()).toEqual(BRIDGE_SOURCES.map((network) => network.id).sort());
  });

  it("acts through the one EVM account on every EVM network", () => {
    expect(walletChainOf(net("base"))).toBe("rh");
    expect(walletChainOf(net("sol"))).toBe("sol");
    expect(explorerTxOf(net("base"), "0xabc")).toBe("https://basescan.org/tx/0xabc");
  });
});

describe("the view in the URL", () => {
  const form = (query = "") => parseForm(new URLSearchParams(query));

  it("starts on Base to Robinhood Chain, with USDC arriving as USDG", () => {
    const view = form();
    expect([view.from.id, view.to.id, view.asset.symbol, view.receive.symbol]).toEqual(["base", "rh", "USDC", "USDG"]);
  });

  it("reads a shared view, and falls back for what it doesn't know", () => {
    const view = form("from=sol&to=rh&asset=SOL&receive=ETH&route=relay");
    expect([view.from.id, view.asset.symbol, view.receive.symbol, view.routeId]).toEqual(["sol", "SOL", "ETH", "relay"]);
    expect(form("from=nope&asset=DOGE").from.id).toBe("base");
    expect(form("to=rh&receive=ETH").receive.symbol).toBe("ETH");
  });

  it("never has both ends on one network", () => {
    const same = form("from=rh&to=rh");
    expect(same.from.id).not.toBe(same.to.id);
    const defaults = form("to=base");
    expect(defaults.from.id).not.toBe("base");
  });

  it("only leads back to its own pages", () => {
    expect(safeReturn("/token/GHOST")).toBe("/token/GHOST");
    expect(safeReturn("/swap")).toBe("/swap");
    for (const path of ["https://evil.example", "//evil.example", "/token/../../x", "/token/a b", "javascript:alert(1)", null]) expect(safeReturn(path)).toBeNull();
  });
});

describe("ranking routes", () => {
  const fast = route({ id: "fast", etaSeconds: 5, outUsd: 98 });
  const cheap = route({ id: "cheap", etaSeconds: 8, outUsd: 99 });
  const slow = route({ id: "canonical", etaSeconds: 600, outUsd: 100, networkUsd: 0.1, trustless: true });

  it("marks the fastest and the cheapest", () => {
    const ranked = rankRoutes([fast, cheap, slow]);
    expect(ranked.fastest?.id).toBe("fast");
    expect(ranked.cheapest?.id).toBe("canonical");
  });

  it("suggests the best value among the quick ones, not a ten-minute route", () => {
    expect(rankRoutes([fast, cheap, slow]).suggested?.id).toBe("cheap");
  });

  it("keeps a choice while it's on offer, and falls back when it isn't", () => {
    expect(chosenRoute([fast, cheap], "fast")?.id).toBe("fast");
    expect(chosenRoute([fast, cheap], "gone")?.id).toBe("cheap");
    expect(chosenRoute([], "fast")).toBeNull();
  });

  it("adds the route's fee and the network's gas", () => {
    expect(totalCost(route({ feeUsd: 1, networkUsd: 0.5 }))).toBe(1.5);
    expect(totalCost(route({ feeUsd: null, networkUsd: null }))).toBeNull();
  });
});

describe("the button", () => {
  const base = net("base");
  const rh = net("rh");
  const usdc = assetOf(base, "USDC");
  if (!usdc) throw new Error("no USDC");
  const ready: ActionInputs = { from: base, to: rh, asset: usdc, sender: "0xs", anyWallet: true, recipient: "0xr", recipientBad: false, raw: "1000000", balance: "5000000", coinBalance: "1000000000000000", route: route({}), loading: false, error: null, tradingOpen: true };
  const state = (patch: Partial<ActionInputs>) => actionState(en.bridge, { ...ready, ...patch });

  it("reviews once everything is in place", () => {
    expect(state({}).kind).toBe("review");
  });

  it("asks for a wallet on the source first", () => {
    expect(state({ sender: null, anyWallet: false })).toMatchObject({ kind: "connect", label: "Connect wallet" });
    expect(state({ sender: null }).label).toBe("Connect a Base wallet");
  });

  it("says what's short", () => {
    expect(state({ raw: null }).label).toBe("Enter an amount");
    expect(state({ raw: "9000000" }).label).toBe("Not enough USDC");
    expect(state({ coinBalance: "0" }).label).toBe("Keep some ETH for gas");
  });

  it("keeps enough of the coin to pay for sending it", () => {
    const eth = assetOf(base, "ETH");
    if (!eth) throw new Error("no ETH");
    expect(state({ asset: eth, raw: "1000000000000000", balance: "1000000000000000", coinBalance: "1000000000000000" }).label).toBe("Keep some ETH for gas");
    expect(state({ asset: eth, raw: "700000000000000", balance: "1000000000000000", coinBalance: "1000000000000000" }).kind).toBe("review");
  });

  it("needs somewhere to send it", () => {
    expect(state({ recipient: null })).toMatchObject({ kind: "connect-to", label: "Connect a wallet on Robinhood Chain to receive" });
    expect(state({ recipient: null, recipientBad: true }).label).toBe("Enter a valid destination address");
  });

  it("explains a route's refusal", () => {
    expect(state({ route: null, error: "too-small" }).label).toBe("Amount too small");
    expect(state({ route: null, error: "too-large" }).label).toBe("Amount too large");
    expect(state({ route: null, error: "no-route" }).label).toBe("No route right now");
    expect(state({ route: null, error: "busy" }).label).toBe("Busy right now. Retrying…");
    expect(state({ route: null, loading: true }).kind).toBe("wait");
  });

  it("stays shut while the switch is off, and says so", () => {
    expect(state({ tradingOpen: false })).toMatchObject({ kind: "blocked", label: "Bridging opens soon" });
  });
});

describe("figures", () => {
  it("reads a delivery time in the unit that fits", () => {
    expect(etaParts(6)).toEqual({ value: 6, unit: "sec" });
    expect(etaParts(600)).toEqual({ value: 10, unit: "min" });
    expect(etaParts(7_200)).toEqual({ value: 2, unit: "hr" });
    expect(etaText(en.bridge, 6)).toBe("~6 sec");
  });

  it("checks a young transfer closely, and an old one rarely", () => {
    expect(checkEvery(10_000)).toBe(3_000);
    expect(checkEvery(600_000)).toBe(10_000);
    expect(checkEvery(7_200_000)).toBe(60_000);
  });
});

describe("what's saved on this device", () => {
  const transfer = { id: "a", from: { network: "base", symbol: "USDC", amount: "1" }, to: { network: "rh", symbol: "USDG", amount: "1" }, routeName: "Relay", sender: "0x", recipient: "0x", raw: "1", tracking: { provider: "relay", requestId: null, tool: null }, sourceTx: "0x", destinationTx: null, etaSeconds: 6, state: "transit", at: 1 };

  it("is checked before it's trusted", () => {
    expect(isRecent(transfer)).toBe(true);
    expect(isRecent({ ...transfer, state: "nope" })).toBe(false);
    expect(isRecent({ ...transfer, sourceTx: 5 })).toBe(false);
    expect(isRecent(null)).toBe(false);
  });

  it("counts a transfer as moving until it lands or stops", () => {
    expect(inFlight({ state: "source" })).toBe(true);
    expect(inFlight({ state: "transit" })).toBe(true);
    expect(inFlight({ state: "delivered" })).toBe(false);
    expect(inFlight({ state: "refunded" })).toBe(false);
    expect(inFlight({ state: "failed" })).toBe(false);
  });
});

describe("responses from the server", () => {
  it("are checked before they're used", () => {
    const good = route({});
    expect(isQuote({ routes: [good], tradingOpen: true })).toBe(true);
    expect(isQuote({ routes: [{ id: 1 }], tradingOpen: true })).toBe(false);
    expect(isBuild({ route: good, approvals: [], tracking: {}, evm: {} })).toBe(true);
    expect(isBuild({ route: good, approvals: [], tracking: {} })).toBe(false);
    expect(isStatus({ state: "delivered" })).toBe(true);
    expect(isStatus({ state: "done" })).toBe(false);
  });
});
