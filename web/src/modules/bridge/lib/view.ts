import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { fmt } from "@/shared/i18n/config";
import { formatFull } from "@/shared/swap/amounts";
import { type BridgeAsset, type BridgeNetwork, etaParts } from "./networks";
import type { BridgeRoute } from "./types";

type Copy = Dictionary["bridge"];

/** "~6 sec", "~10 min". */
export function etaText(b: Copy, seconds: number): string {
  const { value, unit } = etaParts(seconds);
  return fmt(b.eta[unit], { value });
}

/** An amount of the arriving asset, for the boxes. */
export const amountOut = (raw: string, asset: BridgeAsset): string => formatFull({ raw, decimals: asset.decimals });

/** What a route costs in all: its own fee and the source network's gas. */
export function totalCost(route: BridgeRoute): number | null {
  if (route.feeUsd === null && route.networkUsd === null) return null;
  return (route.feeUsd ?? 0) + (route.networkUsd ?? 0);
}

/** What a route is worth to the person: what arrives, less what it costs to send. */
const worth = (route: BridgeRoute) => (route.outUsd ?? 0) - (route.networkUsd ?? 0);

export interface RankedRoutes {
  /** The one to preselect: the best value among those that aren't much slower. */
  suggested: BridgeRoute | null;
  fastest: BridgeRoute | null;
  cheapest: BridgeRoute | null;
}

/** A route up to this much slower than the fastest still counts as quick. */
const QUICK_SECONDS = 60;

export function rankRoutes(routes: readonly BridgeRoute[]): RankedRoutes {
  if (routes.length === 0) return { suggested: null, fastest: null, cheapest: null };
  const fastest = routes.reduce((best, route) => (route.etaSeconds < best.etaSeconds ? route : best));
  const cheapest = routes.reduce((best, route) => (worth(route) > worth(best) ? route : best));
  const limit = Math.max(QUICK_SECONDS, fastest.etaSeconds * 2);
  const quick = routes.filter((route) => route.etaSeconds <= limit);
  return { suggested: quick.reduce((best, route) => (worth(route) > worth(best) ? route : best)), fastest, cheapest };
}

/** The route in use: the one picked, while it's still on offer, else the suggested one. */
export const chosenRoute = (routes: readonly BridgeRoute[], picked: string | null): BridgeRoute | null => routes.find((route) => route.id === picked) ?? rankRoutes(routes).suggested;

export interface ActionState {
  kind: "connect" | "connect-to" | "review" | "wait" | "blocked";
  label: string;
  /** Said under the fields when the button can't go, and why isn't already plain. */
  note: string | null;
}

export interface ActionInputs {
  from: BridgeNetwork;
  to: BridgeNetwork;
  asset: BridgeAsset;
  /** The wallet acting on the source network, and whether any is connected. */
  sender: string | null;
  anyWallet: boolean;
  /** The destination, once there is one; `recipientBad` when a typed one isn't valid. */
  recipient: string | null;
  recipientBad: boolean;
  raw: string | null;
  /** Base units of the sent asset and the network's coin; null until read. */
  balance: string | null;
  coinBalance: string | null;
  route: BridgeRoute | null;
  loading: boolean;
  error: string | null;
  tradingOpen: boolean | null;
}

/** The button's state, in order: a wallet, an amount, enough funds, somewhere to send it, a route, the go-live switch, then Review. */
export function actionState(b: Copy, input: ActionInputs): ActionState {
  const { from, to, asset } = input;
  const blocked = (label: string, note: string | null = null): ActionState => ({ kind: "blocked", label, note });
  if (!input.sender) return { kind: "connect", label: input.anyWallet ? fmt(b.action.connectOn, { network: from.name }) : b.action.connect, note: null };
  if (!input.raw) return blocked(b.action.enterAmount);
  const amount = BigInt(input.raw);
  if (input.balance !== null && amount > BigInt(input.balance)) return blocked(fmt(b.action.short, { symbol: asset.symbol }), fmt(b.action.shortNote, { symbol: asset.symbol, network: from.name }));
  const coin = from.assets[0];
  if (input.coinBalance !== null) {
    const reserve = BigInt(from.feeReserve);
    const coinLeft = BigInt(input.coinBalance) - (asset.native ? amount : BigInt(0));
    // Gas is often a fraction of the reserve, so this only stops a wallet with next to nothing left.
    if (coinLeft < reserve / BigInt(10)) return blocked(fmt(b.action.noGas, { symbol: coin.symbol }), fmt(b.action.noGasNote, { symbol: coin.symbol, network: from.name }));
  }
  if (input.recipientBad) return blocked(b.action.badAddress);
  if (!input.recipient) return { kind: "connect-to", label: fmt(b.action.connectTo, { network: to.name }), note: null };
  if (input.error === "too-small") return blocked(b.action.tooSmall, b.action.tooSmallNote);
  if (input.error === "too-large") return blocked(b.action.tooLarge, b.action.tooLargeNote);
  if (input.error === "no-route") return blocked(b.action.noRoute, b.action.noRouteNote);
  if (input.error && !input.route) return blocked(input.error === "busy" ? b.action.busy : b.action.unavailable);
  if (!input.route) return { kind: "wait", label: b.action.finding, note: null };
  if (input.tradingOpen === false) return blocked(b.action.closed, b.action.closedNote);
  return { kind: "review", label: b.action.review, note: null };
}

/** Internal places a transfer can lead back to; nothing else is followed. */
export function safeReturn(path: string | null): string | null {
  return path && /^\/(?:token\/[A-Za-z0-9]{2,64}|swap|launch|portfolio)$/.test(path) ? path : null;
}
