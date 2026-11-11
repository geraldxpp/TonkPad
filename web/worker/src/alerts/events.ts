import { decodeEventLog } from "viem";
import { clip, visibleText } from "../text";
import { LAUNCHPAD_EVENTS, MIGRATOR_EVENTS } from "./abi";
import { decodeSafeLog, type SafeEvent } from "./safe-events";
import { type Address, type Hex, lower, type RawLog, toNumber } from "./types";

/** Where and when an event happened. */
export interface EventMeta {
  block: number;
  tx: Hex;
  logIndex: number;
}

type Ownership = { kind: "ownershipStarted" | "ownershipTransferred"; from: Address; to: Address };
type Credit = { kind: "credited" | "withdrawn"; account: Address; amount: bigint } | { kind: "redirected"; claimant: Address; recipient: Address; amount: bigint };

export type LaunchpadEvent =
  | { kind: "launched"; token: Address; creator: Address; ticker: string; devBuyEth: bigint }
  | { kind: "trade"; token: Address; trader: Address; isBuy: boolean; grossEth: bigint; protocolFee: bigint; crewFee: bigint; creatorFee: bigint; remaining: bigint }
  | { kind: "bundleTax"; token: Address; sniper: Address; penaltyEth: bigint }
  | { kind: "graduated"; token: Address; pool: Address; ethLiquidity: bigint; creatorBonus: bigint }
  | { kind: "migratorSet"; migrator: Address }
  | { kind: "crewExcluded"; token: Address; account: Address }
  | { kind: "paused" | "unpaused"; by: Address }
  | Credit
  | Ownership;

export type MigratorEvent =
  | { kind: "poolLocked"; token: Address; positionId: bigint; ethSeeded: bigint; poolFee: number }
  | { kind: "remainder"; token: Address; ethToTreasury: bigint }
  | { kind: "postGrad"; token: Address; protocolEth: bigint; crewEth: bigint; creatorEth: bigint }
  | { kind: "treasuryUpdated"; treasury: Address }
  | { kind: "crewRedirected"; token: Address; treasury: Address; amount: bigint }
  | Credit
  | Ownership;

export type ChainEvent = EventMeta &
  ((LaunchpadEvent & { source: "launchpad" }) | (MigratorEvent & { source: "migrator" }) | (SafeEvent & { source: "safe"; safe: Address }));

/**
 * A token's ticker as an alert may show it: letters and digits only, at most
 * 16. Whatever a token calls itself is untrusted (no maximum on chain), so
 * nothing else of it reaches a message: no links, mentions or line breaks.
 */
export function ticker(raw: string): string {
  return clip(visibleText(raw).replace(/[^A-Za-z0-9]/g, ""), 16);
}

function launchpadEvent(log: RawLog): LaunchpadEvent | null {
  const { eventName, args } = decodeEventLog({ abi: LAUNCHPAD_EVENTS, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]], strict: true });
  switch (eventName) {
    case "MissionLaunched":
      return { kind: "launched", token: lower(args.token), creator: lower(args.creator), ticker: ticker(args.symbol), devBuyEth: args.devBuyEth };
    case "CurveTrade":
      return { kind: "trade", token: lower(args.token), trader: lower(args.trader), isBuy: args.isBuy, grossEth: args.grossEth, protocolFee: args.protocolFee, crewFee: args.crewFee, creatorFee: args.creatorFee, remaining: args.remainingCurveTokens };
    case "BundleTaxCollected":
      return { kind: "bundleTax", token: lower(args.token), sniper: lower(args.sniper), penaltyEth: args.penaltyEth };
    case "MissionGraduated":
      return { kind: "graduated", token: lower(args.token), pool: lower(args.dexPoolOrPosition), ethLiquidity: args.ethLiquidity, creatorBonus: args.creatorGradBonus };
    case "FallbackEthCredited":
      return { kind: "credited", account: lower(args.recipient), amount: args.amount };
    case "FallbackEthWithdrawn":
      return { kind: "withdrawn", account: lower(args.recipient), amount: args.amount };
    case "FallbackEthRedirected":
      return { kind: "redirected", claimant: lower(args.claimant), recipient: lower(args.recipient), amount: args.amount };
    case "GraduationMigratorSet":
      return { kind: "migratorSet", migrator: lower(args.migrator) };
    case "CrewExcluded":
      return { kind: "crewExcluded", token: lower(args.token), account: lower(args.account) };
    case "Paused":
      return { kind: "paused", by: lower(args.account) };
    case "Unpaused":
      return { kind: "unpaused", by: lower(args.account) };
    case "OwnershipTransferStarted":
      return { kind: "ownershipStarted", from: lower(args.previousOwner), to: lower(args.newOwner) };
    case "OwnershipTransferred":
      return { kind: "ownershipTransferred", from: lower(args.previousOwner), to: lower(args.newOwner) };
  }
}

function migratorEvent(log: RawLog): MigratorEvent | null {
  const { eventName, args } = decodeEventLog({ abi: MIGRATOR_EVENTS, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]], strict: true });
  switch (eventName) {
    case "PoolGraduatedAndLocked":
      return { kind: "poolLocked", token: lower(args.token), positionId: args.positionTokenId, ethSeeded: args.ethSeeded, poolFee: args.poolFee };
    case "MigrationRemainderHandled":
      return { kind: "remainder", token: lower(args.token), ethToTreasury: args.ethToTreasury };
    case "PostGradRewardsDistributed":
      return { kind: "postGrad", token: lower(args.token), protocolEth: args.protocolEth, crewEth: args.crewEth, creatorEth: args.creatorEth };
    case "FallbackEthCredited":
      return { kind: "credited", account: lower(args.recipient), amount: args.amount };
    case "FallbackEthWithdrawn":
      return { kind: "withdrawn", account: lower(args.recipient), amount: args.amount };
    case "FallbackEthRedirected":
      return { kind: "redirected", claimant: lower(args.claimant), recipient: lower(args.recipient), amount: args.amount };
    case "ProtocolTreasuryUpdated":
      return { kind: "treasuryUpdated", treasury: lower(args.treasury) };
    case "CrewRewardRedirected":
      return { kind: "crewRedirected", token: lower(args.token), treasury: lower(args.treasury), amount: args.amount };
    case "OwnershipTransferStarted":
      return { kind: "ownershipStarted", from: lower(args.previousOwner), to: lower(args.newOwner) };
    case "OwnershipTransferred":
      return { kind: "ownershipTransferred", from: lower(args.previousOwner), to: lower(args.newOwner) };
  }
}

/** Decodes without throwing: an event this module doesn't read (metadata edits, lock extensions, claims) is null. */
function attempt<T>(decode: () => T | null): T | null {
  try {
    return decode();
  } catch {
    return null;
  }
}

/**
 * The watched contracts' logs as events, in chain order. Each contract's
 * events count only from its own address, and a Safe's only from an owner
 * the watcher knows, so a look-alike event from anywhere else is ignored.
 */
export function decodeLogs(raw: readonly RawLog[], launchpad: Address, migrator: Address, safes: ReadonlySet<Address>): ChainEvent[] {
  const events: ChainEvent[] = [];
  for (const log of raw) {
    const from = lower(log.address);
    const meta: EventMeta = { block: toNumber(log.blockNumber), tx: lower(log.transactionHash), logIndex: toNumber(log.logIndex) };
    if (from === launchpad) {
      const event = attempt(() => launchpadEvent(log));
      if (event) events.push({ ...meta, source: "launchpad", ...event });
    } else if (from === migrator) {
      const event = attempt(() => migratorEvent(log));
      if (event) events.push({ ...meta, source: "migrator", ...event });
    } else if (safes.has(from)) {
      const event = attempt(() => decodeSafeLog(log));
      if (event) events.push({ ...meta, source: "safe", safe: from, ...event });
    }
  }
  return events.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}
