import { encodeFunctionData } from "viem";
import { type CurveSettings, devBuyQuote, maxDevBuy } from "../curve";
import { AGENT_VOICES, type AgentSettings, encodeAgent, encodeMetadata, LIMITS, normalizeTelegram, normalizeWebsite, normalizeX } from "../metadata";
import type { TonkNetwork } from "../networks";
import { CREATOR_OPTIONS, CREW_OPTIONS, effectiveTier, isLocked, LOCK_TYPE_ID, lockedAmount, type LockSettings, type LockType, MAX_LOCK_DAYS, REWARD_POOL_BPS, TIER_CREATOR_MAX } from "../rules";
import { curveSettings, type LaunchBuild, type LaunchRequest } from "../types";
import { LAUNCHPAD_ABI } from "./abi";
import { address, invalid, isRecord, padGas, refusal, requireDeployedMigrator, requireFunds, text as string, unsigned } from "./build";
import { TonkError, tonkClient } from "./client";
import { readSettings } from "./settings";

const DAY = 86_400;

/** The details a creator sets at launch and can change later: the same checks both times. */
export function parseDetails(body: Record<string, unknown>): Pick<LaunchRequest, "description" | "x" | "telegram" | "website" | "agent"> {
  const description = string(body.description ?? "", LIMITS.description, "description");
  const [x, telegram, website] = [string(body.x ?? "", LIMITS.link, "x"), string(body.telegram ?? "", LIMITS.link, "telegram"), string(body.website ?? "", LIMITS.link, "website")];
  if (normalizeX(x) === null || normalizeTelegram(telegram) === null || normalizeWebsite(website) === null) throw invalid("links");
  let agent: AgentSettings | null = null;
  if (body.agent !== null && body.agent !== undefined) {
    if (!isRecord(body.agent)) throw invalid("agent");
    const voice = body.agent.voice;
    if (!AGENT_VOICES.some((option) => option === voice)) throw invalid("agent voice");
    agent = { name: string(body.agent.name, LIMITS.agentName, "agent name").trim(), role: string(body.agent.role, LIMITS.agentRole, "agent role").trim(), voice: voice as AgentSettings["voice"], brief: string(body.agent.brief, LIMITS.agentBrief, "agent brief").trim() };
    if (!agent.name || !agent.role || !agent.brief) throw invalid("agent fields");
  }
  return { description, x, telegram, website, agent };
}

/** A launch request checked field by field. It only passes what the Creator Studio itself could have sent. */
export function parseLaunchRequest(body: unknown): LaunchRequest {
  if (!isRecord(body)) throw invalid("not an object");
  const creator = address(body.creator, "creator");
  const name = string(body.name, LIMITS.name, "name").trim();
  const ticker = string(body.ticker, LIMITS.ticker, "ticker");
  if (!name || !/^[A-Z0-9]{1,10}$/.test(ticker)) throw invalid("name or ticker");
  const { description, x, telegram, website, agent } = parseDetails(body);
  if (typeof body.devBuy !== "string" || !/^(0|[1-9]\d{0,29})$/.test(body.devBuy)) throw invalid("devBuy");
  const lock = body.lock;
  if (lock !== "none" && lock !== "time" && lock !== "linear") throw invalid("lock");
  const [share, days, crewBps, creatorBps] = [body.share, body.days, body.crewBps, body.creatorBps].map(Number);
  if (![share, days, crewBps, creatorBps].every(Number.isInteger)) throw invalid("numbers");
  if (!(CREW_OPTIONS as readonly number[]).includes(crewBps) || !(CREATOR_OPTIONS as readonly number[]).includes(creatorBps)) throw invalid("fees");
  return { creator, name, ticker, description, x, telegram, website, devBuy: body.devBuy, lock: lock as LockType, share, days, crewBps, creatorBps, agent };
}

/** The lock as the contract will judge it, after the launchpad's own launch rules. */
function checkedLock(request: LaunchRequest, settings: CurveSettings): LockSettings {
  const devBuy = BigInt(request.devBuy);
  if (devBuy > maxDevBuy(settings)) throw invalid("dev buy over the cap");
  const lock: LockSettings = request.lock === "none" ? { type: "none", sharePct: 0, days: 0 } : { type: request.lock, sharePct: request.share, days: request.days };
  if (lock.type !== "none" && (!isLocked(devBuy > BigInt(0), lock) || lock.sharePct > 100 || lock.days > MAX_LOCK_DAYS)) throw invalid("lock");
  if (request.crewBps + request.creatorBps > REWARD_POOL_BPS) throw invalid("fee pool");
  // The tier counts only if the lock holds 1% of supply, as the mainnet contract rules (review finding M-2).
  const bought = devBuyQuote(settings, devBuy, request.creatorBps).tokensOut;
  if (request.creatorBps > TIER_CREATOR_MAX[effectiveTier(devBuy > BigInt(0), lock, bought)]) throw invalid("creator tier");
  return lock;
}

/** The contract's LaunchParams for a request. */
export function launchParams(request: LaunchRequest, lock: LockSettings) {
  return {
    name: request.name,
    symbol: request.ticker,
    metadataUri: encodeMetadata(request),
    agentPrompt: encodeAgent(request.agent),
    crewFeeBps: request.crewBps,
    creatorFeeBps: request.creatorBps,
    lockType: LOCK_TYPE_ID[lock.type],
    lockShareBps: lock.sharePct * 100,
    lockDurationSeconds: BigInt(lock.days * DAY),
  };
}

/**
 * Builds a launch for the creator's wallet to sign. The settings are read
 * fresh, the exact call is simulated from the creator's address (so a
 * refusal or a short balance shows before any wallet opens), and its gas is
 * estimated. Nothing is sent from here: only the creator's wallet can.
 */
export async function buildLaunch(network: TonkNetwork, request: LaunchRequest): Promise<LaunchBuild> {
  const settings = await readSettings(network, 0);
  const curve = curveSettings(settings);
  const lock = checkedLock(request, curve);
  if (settings.paused) throw new TonkError("paused", "launches are paused", 409);

  const devBuy = BigInt(request.devBuy);
  const value = curve.launchFee + devBuy;
  const call = { address: network.launchpad, abi: LAUNCHPAD_ABI, functionName: "launchMission", args: [launchParams(request, lock)], account: request.creator as `0x${string}`, value } as const;
  const client = await tonkClient(network);
  // A launch's own buy can complete its curve.
  await requireDeployedMigrator(client, network);
  let gas: bigint;
  try {
    await client.simulateContract(call);
    gas = padGas(await client.estimateContractGas(call));
  } catch (error) {
    throw refusal(error);
  }
  await requireFunds(client, call.account, value, gas);

  const quote = devBuyQuote(curve, devBuy, request.creatorBps);
  return {
    tx: unsigned(network.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "launchMission", args: call.args }), value, gas),
    settings,
    bought: String(quote.tokensOut),
    locked: String(lockedAmount(quote.tokensOut, lock)),
  };
}
