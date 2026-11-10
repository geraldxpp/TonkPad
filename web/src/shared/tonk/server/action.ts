import { encodeFunctionData } from "viem";
import { claimableAt, DAY_SECONDS, extendLock, MIN_EXTENSION_DAYS } from "../lock";
import { encodeAgent, encodeMetadata } from "../metadata";
import { type ActionBuild, type ActionRequest, missionLock } from "../mission";
import type { TonkNetwork } from "../networks";
import { LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { type Address, address, invalid, isRecord, padGas, refusal, requireFunds, unsigned } from "./build";
import { TonkError, tonkClient } from "./client";
import { parseDetails } from "./launch";
import { readMission } from "./mission";

/** The longest single extension the screen offers; a lock can be extended again. */
export const MAX_EXTENSION_DAYS = 3650;

const nothing = (what: string) => new TonkError("nothing", what, 409);

/** An action request checked field by field. */
export function parseActionRequest(body: unknown): ActionRequest {
  if (!isRecord(body)) throw invalid("not an object");
  const owner = address(body.owner, "owner");
  if (body.kind === "withdraw") return { kind: "withdraw", owner };
  const token = address(body.token, "token");
  if (body.kind === "claim" || body.kind === "rewards") return { kind: body.kind, token, owner };
  if (body.kind === "extend") {
    const days = Number(body.days);
    if (!Number.isInteger(days) || days < MIN_EXTENSION_DAYS || days > MAX_EXTENSION_DAYS) throw invalid("days");
    return { kind: "extend", token, owner, days };
  }
  if (body.kind === "edit") return { kind: "edit", token, owner, ...parseDetails(body) };
  throw invalid("kind");
}

/** The call an action makes, after the checks the contract itself would make. */
async function actionCall(network: TonkNetwork, request: ActionRequest): Promise<{ to: Address; data: `0x${string}` }> {
  const client = await tonkClient(network);
  const owner = request.owner as Address;
  const pad = network.launchpad;
  const read = <T>(load: Promise<T>) =>
    load.catch(() => {
      throw new TonkError("unavailable", "state unreadable");
    });
  if (request.kind === "withdraw") {
    const owed = await read(client.readContract({ address: pad, abi: LAUNCHPAD_ABI, functionName: "claimableEth", args: [owner] }));
    if (owed === BigInt(0)) throw nothing("no unpaid ETH");
    return { to: pad, data: encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "withdrawAccruedEth" }) };
  }

  const mission = await readMission(network, request.token, 0);
  const token = mission.token as Address;
  if (request.kind === "rewards") {
    const unpaid = await read(client.readContract({ address: token, abi: TOKEN_ABI, functionName: "viewUnpaidRewards", args: [owner] }));
    if (unpaid === BigInt(0)) throw nothing("no unpaid rewards");
    return { to: token, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: "sweepMyCrewRewards" }) };
  }

  // The rest are the creator's alone.
  if (mission.creator.toLowerCase() !== owner.toLowerCase()) throw new TonkError("forbidden", "only the creator", 403);
  if (request.kind === "edit") {
    return { to: pad, data: encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "updateMissionMetadata", args: [token, encodeMetadata(request), encodeAgent(request.agent)] }) };
  }
  const lock = mission.lock ? missionLock(mission.lock) : null;
  const now = Math.floor(Date.now() / 1000);
  if (request.kind === "claim") {
    if (!lock || claimableAt(lock, now) === BigInt(0)) throw nothing("nothing has unlocked");
    return { to: pad, data: encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "claimDevTokens", args: [token] }) };
  }
  const seconds = request.days * DAY_SECONDS;
  if (!lock || typeof extendLock(lock, now, seconds) === "string") throw nothing("no lock to extend");
  return { to: pad, data: encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "extendDevLock", args: [token, BigInt(seconds)] }) };
}

/**
 * Builds a claim, a lock extension, an edit, a reward claim or a withdrawal
 * for the wallet to sign. The call is simulated from that wallet first, so a
 * refusal shows before any wallet opens. Nothing is sent from here.
 */
export async function buildAction(network: TonkNetwork, request: ActionRequest): Promise<ActionBuild> {
  const { to, data } = await actionCall(network, request);
  const client = await tonkClient(network);
  const account = request.owner as Address;
  let gas: bigint;
  try {
    await client.call({ account, to, data });
    gas = padGas(await client.estimateGas({ account, to, data }));
  } catch (error) {
    throw refusal(error);
  }
  await requireFunds(client, account, BigInt(0), gas);
  return { tx: unsigned(to, data, BigInt(0), gas) };
}
