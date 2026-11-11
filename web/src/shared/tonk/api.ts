import type { ActionBuild, ActionRequest, MissionAccountJson, MissionJson, MissionPageJson, MissionSummaryJson, TradeBuild, TradeRequest, TradeSide } from "./mission";
import type { PoolQuoteJson, PoolTradeBuild, PoolTradeRequest } from "./pool";
import { isTxHash, type LaunchBuild, type LaunchRequest, type LaunchStatus, type TonkSettingsJson, type TxCall, type TxSender } from "./types";

/** The server's reason, as a code the screen turns into words: "paused", "funds", "refused", "busy", "unavailable"… */
export class TonkApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TonkApiError";
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

async function call<T>(input: string, check: (body: unknown) => body is T, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TonkApiError("unavailable");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new TonkApiError(record(body) && typeof body.error === "string" ? body.error : "unavailable");
  if (!check(body)) throw new TonkApiError("unavailable");
  return body;
}

export const SETTINGS_PATH = "/api/tonk/settings";

export const isSettings = (body: unknown): body is TonkSettingsJson =>
  record(body) && typeof body.launchFee === "string" && typeof body.virtualEth === "string" && typeof body.virtualTokens === "string" && typeof body.paused === "boolean";

const isBuild = (body: unknown): body is LaunchBuild =>
  record(body) && record(body.tx) && typeof body.tx.to === "string" && typeof body.tx.data === "string" && typeof body.tx.value === "string" && isSettings(body.settings);

const isStatus = (body: unknown): body is LaunchStatus => record(body) && typeof body.state === "string" && (body.mission === null || record(body.mission));

/** The launchpad's settings, read fresh. */
export function fetchSettings(signal?: AbortSignal): Promise<TonkSettingsJson> {
  return call(SETTINGS_PATH, isSettings, { signal });
}

/** Asks the server to check a launch against the contract and build its transaction. Nothing is sent. */
export function buildLaunch(request: LaunchRequest): Promise<LaunchBuild> {
  return call("/api/tonk/launch", isBuild, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
}

const isCall = (value: unknown): value is TxCall =>
  record(value) && (value.to === null || (typeof value.to === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.to))) && typeof value.data === "string" && /^0x[0-9a-fA-F]*$/.test(value.data) && typeof value.value === "string" && /^\d+$/.test(value.value);

const isSender = (value: unknown): value is TxSender => record(value) && typeof value.from === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.from) && typeof value.nonce === "number" && Number.isSafeInteger(value.nonce) && value.nonce >= 0;

/**
 * Where a transaction stands and, once confirmed, what it did. `sender` is
 * what an earlier answer said about it, so a transaction the node has since
 * dropped can still be traced to whatever replaced it.
 */
export async function fetchLaunchStatus(hash: string, sender: TxSender | null = null): Promise<LaunchStatus> {
  const query = new URLSearchParams({ hash, ...(sender ? { from: sender.from, nonce: String(sender.nonce) } : {}) });
  const status = await call(`/api/tonk/tx?${query}`, isStatus);
  return {
    ...status,
    events: Array.isArray(status.events) ? status.events : [],
    block: typeof status.block === "number" ? status.block : null,
    sender: isSender(status.sender) ? status.sender : null,
    replacedBy: typeof status.replacedBy === "string" && isTxHash(status.replacedBy) ? status.replacedBy : null,
    replacedCall: isCall(status.replacedCall) ? status.replacedCall : null,
  };
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const isTx = (tx: unknown) => record(tx) && typeof tx.to === "string" && typeof tx.data === "string" && typeof tx.value === "string";

export const isMission = (body: unknown): body is MissionJson =>
  record(body) && typeof body.token === "string" && typeof body.creator === "string" && typeof body.virtualEth === "string" && typeof body.virtualTokens === "string" && typeof body.tokensLeft === "string" && typeof body.graduated === "boolean";

export const isMissionPage = (body: unknown): body is MissionPageJson => record(body) && isMission(body.mission) && Array.isArray(body.trades);

const isAccount = (body: unknown): body is MissionAccountJson =>
  record(body) && typeof body.owner === "string" && typeof body.eth === "string" && typeof body.tokens === "string" && typeof body.allowance === "string" && typeof body.unpaidRewards === "string";

const isTradeBuild = (body: unknown): body is TradeBuild =>
  record(body) && isMission(body.mission) && (body.step === "moved" || (body.step === "approve" && isTx(body.tx)) || (body.step === "trade" && isTx(body.tx) && record(body.quote)));

const isActionBuild = (body: unknown): body is ActionBuild => record(body) && isTx(body.tx);

export const missionPath = (token: string) => `/api/tonk/token/${token}`;

/** A mission and its newest trades, read fresh from the chain. */
export function fetchMission(token: string, signal?: AbortSignal): Promise<MissionPageJson> {
  return call(missionPath(token), isMissionPage, { signal });
}

/** A wallet's balances, allowance, unpaid rewards and unpaid ETH on one mission. */
export function fetchAccount(token: string, owner: string, signal?: AbortSignal): Promise<MissionAccountJson> {
  return call(`/api/tonk/account?${new URLSearchParams({ token, owner })}`, isAccount, { signal });
}

/** Asks the server to check a curve trade against the contract and build it. Nothing is sent. */
export function buildTrade(request: TradeRequest): Promise<TradeBuild> {
  return call("/api/tonk/trade", isTradeBuild, post(request));
}

/** Asks the server to check and build a claim, an extension, an edit, a reward claim or a withdrawal. Nothing is sent. */
export function buildAction(request: ActionRequest): Promise<ActionBuild> {
  return call("/api/tonk/action", isActionBuild, post(request));
}

const isPoolQuote = (body: unknown): body is PoolQuoteJson =>
  record(body) && typeof body.pool === "string" && (body.side === "buy" || body.side === "sell") && typeof body.amountIn === "string" && typeof body.out === "string" && typeof body.feeBps === "number";

const isPoolBuild = (body: unknown): body is PoolTradeBuild =>
  record(body) && isPoolQuote(body.quote) && (body.step === "moved" || ((body.step === "approve" || body.step === "allow" || body.step === "trade") && isTx(body.tx)));

/** What a graduated token's pool gives now for an exact amount in. */
export function fetchPoolQuote(token: string, side: TradeSide, amount: string, signal?: AbortSignal): Promise<PoolQuoteJson> {
  return call(`/api/tonk/pool/quote?${new URLSearchParams({ token, side, amount })}`, isPoolQuote, { signal });
}

/** Asks the server to check a pool trade at one block and build it, or the approval it needs first. Nothing is sent. */
export function buildPoolTrade(request: PoolTradeRequest): Promise<PoolTradeBuild> {
  return call("/api/tonk/pool/trade", isPoolBuild, post(request));
}

/** The launchpad's latest launches, newest first. */
export function fetchLatestMissions(signal?: AbortSignal): Promise<MissionSummaryJson[]> {
  return call("/api/tonk/missions", (body): body is MissionSummaryJson[] => Array.isArray(body) && body.every((item) => record(item) && typeof item.token === "string" && typeof item.name === "string"), { signal });
}
