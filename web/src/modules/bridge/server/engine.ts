import { toUnits } from "@/shared/wallet/units";
import type { BridgeApproval, BridgeBuild, BridgeQuote, BridgeRoute } from "../lib/types";
import { acrossPlan } from "./across";
import { canonicalApplies, canonicalPlan, DEPOSIT_GAS, isPlainWallet } from "./canonical";
import { type BridgeConfig, BridgeError, type BridgeErrorCode } from "./config";
import { lifiPlan } from "./lifi";
import type { ProviderPlan } from "./plan";
import { relayPlan } from "./relay";
import type { BridgeRequest } from "./request";
import { rpcFor } from "./rpc";
import { assembleRelayTransaction } from "./solana";

type Planner = (request: BridgeRequest, config: BridgeConfig) => Promise<ProviderPlan>;

/** A deposit's gas in the network's coin rides along for the engine to price. */
interface PricedPlan extends ProviderPlan {
  gasWei?: bigint;
}

const ALLOWANCE = "0xdd62ed3e";
/** Mainnet USDT refuses to change a non-zero allowance straight to another: it has to go through zero. */
const RESET_FIRST = new Set(["0xdac17f958d2ee523a2206206994597c13d831ec7"]);
/** How far a firm quote may fall below what the person reviewed before they're asked again. */
const REVIEW_TOLERANCE = { keep: BigInt(995), of: BigInt(1000) };
const TELLING: readonly BridgeErrorCode[] = ["too-small", "too-large", "busy", "no-route", "unavailable"];

const bothEvm = (request: BridgeRequest) => request.from.vm === "evm" && request.to.vm === "evm";

const canonical: Planner = async (request) => {
  const rpc = rpcFor(request.from);
  if (request.real && !(await isPlainWallet(rpc, request.sender))) throw new BridgeError("no-route", "canonical: contract wallet");
  const price = await rpc("eth_gasPrice", []).catch(() => null);
  return { ...canonicalPlan(request), gasWei: typeof price === "string" ? BigInt(price) * DEPOSIT_GAS : undefined } satisfies PricedPlan;
};

/** Who can carry this transfer. Only Relay delivers gas with it, and only Relay covers Solana. */
function plannersFor(request: BridgeRequest): Planner[] {
  return [relayPlan, ...(bothEvm(request) && !request.gasTopUp ? [acrossPlan] : []), ...(canonicalApplies(request) ? [canonical] : [])];
}

const usdPerUnit = (usd: number | null, raw: string, decimals: number) => {
  const units = toUnits({ raw, decimals });
  return usd !== null && units > 0 ? usd / units : null;
};

/**
 * Puts every route on the same footing. Providers value things differently,
 * so like-for-like transfers are costed from what goes in and comes out, at
 * one price; a route that didn't say what its gas costs borrows another's,
 * since the deposit is about the same transaction.
 */
export function finishRoutes(plans: readonly PricedPlan[], request: BridgeRequest): BridgeRoute[] {
  const inUnits = toUnits({ raw: request.amount, decimals: request.asset.decimals });
  const sameKind = request.asset.family === request.receive.family && request.asset.family !== "coin";
  const priced = plans.map((plan) => plan.route);
  const unitIn = priced.map((route) => usdPerUnit(route.inUsd, request.amount, request.asset.decimals)).find((unit) => unit !== null) ?? (request.asset.family === "usd" ? 1 : null);
  const unitOut = priced.map((route) => usdPerUnit(route.outUsd, route.outAmount, request.receive.decimals)).find((unit) => unit !== null) ?? (request.receive.family === "usd" ? 1 : null);
  const borrowed = priced.map((route) => route.networkUsd).find((usd) => usd !== null) ?? null;
  return plans
    .map((plan): BridgeRoute => {
      const { route } = plan;
      const outUnits = toUnits({ raw: route.outAmount, decimals: request.receive.decimals });
      const inUsd = unitIn !== null ? inUnits * unitIn : route.inUsd;
      const outUsd = unitOut !== null ? outUnits * unitOut : route.outUsd;
      const measured = sameKind && unitIn !== null ? Math.max(0, (inUnits - outUnits) * unitIn - (route.gasTopUp?.usd ?? 0)) : null;
      const gasUsd = plan.gasWei !== undefined && unitIn !== null && request.asset.family === "eth" ? toUnits({ raw: String(plan.gasWei), decimals: 18 }) * unitIn : route.networkUsd;
      const stated = route.feeUsd ?? (inUsd !== null && outUsd !== null ? inUsd - outUsd : null);
      // A route can quote better than the market for a moment, but it never costs less than nothing.
      return { ...route, inUsd, outUsd, feeUsd: measured ?? (stated !== null ? Math.max(0, stated) : null), networkUsd: gasUsd ?? borrowed };
    })
    .sort((a, b) => (b.outUsd ?? 0) - (b.networkUsd ?? 0) - ((a.outUsd ?? 0) - (a.networkUsd ?? 0)));
}

function worstReason(results: readonly PromiseSettledResult<unknown>[]): BridgeError {
  const codes = results.flatMap((result) => (result.status === "rejected" && result.reason instanceof BridgeError ? [result.reason.code] : []));
  const code = TELLING.find((candidate) => codes.includes(candidate)) ?? "unavailable";
  return new BridgeError(code, "no route answered", code === "too-small" || code === "too-large" || code === "no-route" ? 400 : 502);
}

/** Every route that can carry this transfer, compared. One failing leaves the rest standing. */
export async function quoteBridge(request: BridgeRequest, config: BridgeConfig): Promise<BridgeQuote> {
  if (!config.providersOn) throw new BridgeError("unavailable", "providers off");
  const planners = [...plannersFor(request), ...(config.lifiKey && bothEvm(request) && !request.gasTopUp ? [lifiPlan] : [])];
  let results: PromiseSettledResult<PricedPlan>[] = await Promise.allSettled(planners.map((plan) => plan(request, config)));
  // Without a key LI.FI allows only a trickle of requests, so it's kept for when nothing else has a route.
  if (results.every((result) => result.status === "rejected") && !config.lifiKey && bothEvm(request) && !request.gasTopUp) {
    results = [...results, ...(await Promise.allSettled([lifiPlan(request, config)]))];
  }
  const plans = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (plans.length === 0) throw worstReason(results);
  return { routes: finishRoutes(plans, request), tradingOpen: config.tradingOpen, quotedAt: Date.now() };
}

const plannerOf = (routeId: string): Planner | null => (routeId === "relay" ? relayPlan : routeId === "across" ? acrossPlan : routeId === "lifi" ? lifiPlan : routeId === "canonical" ? canonical : null);

/** Exactly what's being sent, and only when the allowance is short. An unreadable allowance asks again rather than assuming. */
async function approvalsFor(plan: ProviderPlan, request: BridgeRequest): Promise<BridgeApproval[]> {
  if (request.asset.native || !plan.spender) return [];
  const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const token = request.asset.address;
  const answer = await rpcFor(request.from)("eth_call", [{ to: token, data: `${ALLOWANCE}${word(request.sender)}${word(plan.spender)}` }, "latest"]).catch(() => null);
  const allowance = typeof answer === "string" && /^0x[\da-fA-F]+$/.test(answer) ? BigInt(answer) : BigInt(0);
  if (allowance >= BigInt(request.amount)) return [];
  const clear = allowance > BigInt(0) && RESET_FIRST.has(token.toLowerCase()) ? [{ token, spender: plan.spender, amount: "0" }] : [];
  return [...clear, { token, spender: plan.spender, amount: request.amount }];
}

/**
 * The transaction(s) for the wallet, for the route the person chose, built
 * fresh. Refused while the switch is off, and when it would now deliver less
 * than they reviewed: they see the new figures and decide again.
 */
export async function buildBridge(request: BridgeRequest, routeId: string, reviewedOut: string, config: BridgeConfig): Promise<BridgeBuild> {
  if (!config.tradingOpen) throw new BridgeError("closed", "transfers are not open yet", 403);
  if (!config.providersOn) throw new BridgeError("unavailable", "providers off");
  if (!request.real) throw new BridgeError("invalid", "wallets required", 400);
  const planner = plannerOf(routeId);
  if (!planner || (routeId === "canonical" && !canonicalApplies(request))) throw new BridgeError("invalid", "bad route", 400);
  const plan: PricedPlan = await planner(request, config);
  if (BigInt(plan.route.outAmount) * REVIEW_TOLERANCE.of < BigInt(reviewedOut) * REVIEW_TOLERANCE.keep) throw new BridgeError("price-moved", "the quote fell", 409);
  const [approvals, transaction] = await Promise.all([approvalsFor(plan, request), plan.solana ? assembleRelayTransaction(plan.solana, request.sender, rpcFor(request.from)) : null]);
  return { route: finishRoutes([plan], request)[0], approvals, evm: plan.evm, solana: transaction ? { transaction } : null, tracking: plan.tracking };
}
