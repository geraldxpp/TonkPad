import { LAUNCHPADS } from "@/shared/config/launchpads";
import { claimableAt } from "@/shared/tonk/lock";
import { type MissionLockJson, missionLock } from "@/shared/tonk/mission";
import type { TrackedToken } from "../../model";
import type { TokenStore } from "../../store";
import { toToken } from "../../tokens";
import type { TonkState } from "../../tonk/state";
import { findTrackedToken } from "../../views/token";
import { LAST_DATE } from "../posts";
import { plainText } from "../text";
import { badges, CHAINS } from "../views";
import { HIDDEN_NAME, nameHidden } from "./data-names";
import type { AgentData, LaunchFigures, ToolToken } from "./types";

/**
 * What the answer's tools read (prompts/15-community-agent.md, The tools):
 * the worker's own tokens, straight from the store with toToken, as the
 * bot's cards read them. Never views.token() or /v1/token, so asking about
 * a token never marks it opened and spends no Helius credits. A token comes
 * back without its creator's or holders' wallets, its metadata texts, its
 * agent brief or its art; its name and ticker are cleaned, or hidden.
 */

export interface AgentDataOptions {
  store: TokenStore;
  /** The launchpad's figures (agent/figures.ts). */
  figures: () => Promise<LaunchFigures | null>;
  /** Creator wallets allowed to use the brand in a token's name (TELEGRAM_BRAND_CREATORS), lower-cased. */
  brandCreators: ReadonlySet<string>;
  now: () => number;
}

const ZERO = BigInt(0);
const WEI = /^\d{1,78}$/;
const LOCK_KINDS: ReadonlyArray<MissionLockJson["type"]> = ["time", "linear", "none"];

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** A stored lock the maths can read: whole seconds and wei amounts. A snapshot that holds anything else counts as no lock. */
function readableLock(lock: MissionLockJson | null): MissionLockJson | null {
  if (!lock || !LOCK_KINDS.includes(lock.type) || !Number.isSafeInteger(lock.start) || !Number.isSafeInteger(lock.end)) return null;
  return [lock.total, lock.claimed, lock.checkpoint].every((v) => typeof v === "string" && WEI.test(v)) ? lock : null;
}

/** A tonkfun.fun launch's own facts: its dev lock, what the creator can claim now, its Crew and Creator Rewards and the Block-0 Shield. */
function launchFacts(s: TonkState, now: number): NonNullable<ToolToken["launch"]> {
  const lock = readableLock(s.lock);
  const total = lock ? BigInt(lock.total) : ZERO;
  const claimable = lock && total > ZERO ? claimableAt(missionLock(lock), Math.floor(now / 1000)) : null;
  return {
    lockPct: lock && finite(lock.lockedBps) ? lock.lockedBps / 100 : null,
    lockKind: lock ? lock.type : "none",
    lockEnds: lock && lock.end > 0 && lock.end <= LAST_DATE ? new Date(lock.end * 1000).toISOString().slice(0, 10) : null,
    // Of the tokens locked at launch, the share the creator can claim now, in percent.
    claimablePct: claimable !== null ? Number(((claimable > ZERO ? claimable : ZERO) * BigInt(10_000)) / total) / 100 : null,
    crewPct: finite(s.crewBps) ? s.crewBps / 100 : null,
    creatorPct: finite(s.creatorBps) ? s.creatorBps / 100 : null,
    // Every tonkfun.fun launch carries it: the 99% tax on separate buys in its launch block and the next.
    shield: true,
  };
}

/** A tracked token as get_token returns it, at time `now`. */
export function toolToken(t: TrackedToken, now: number, brandCreators: ReadonlySet<string>): ToolToken {
  const card = toToken(t, now);
  const hidden = nameHidden(t.name, t.symbol, t.creator, brandCreators);
  const market = t.marketAt > 0 && finite(card.marketCap) && card.marketCap > 0;
  const graduated = t.graduated || card.curve >= 1;
  return {
    address: t.address,
    name: hidden ? HIDDEN_NAME : plainText(card.name, 40),
    ticker: hidden ? "" : plainText(card.ticker, 16),
    nameHidden: hidden,
    launchpad: LAUNCHPADS[t.launchpad]?.name ?? "another launchpad",
    chain: CHAINS[t.chain] ?? "another chain",
    score: card.score,
    level: card.level,
    badges: badges(card, "en"),
    marketCapUsd: market ? Math.round(card.marketCap) : null,
    change24h: market && finite(card.change24h) ? round(card.change24h, 1) : null,
    curvePct: graduated ? 100 : finite(card.curve) ? Math.min(99, Math.max(0, Math.floor(card.curve * 100))) : null,
    graduated,
    holders: finite(card.holders) ? Math.max(0, Math.round(card.holders)) : null,
    ageMinutes: finite(card.ageMinutes) ? Math.floor(card.ageMinutes) : 0,
    launch: t.tonk ? launchFacts(t.tonk, now) : null,
  };
}

/** The tools' data. Neither call throws: a token that can't be read is null, and so are figures that can't. */
export function createAgentData(options: AgentDataOptions): AgentData {
  return {
    token(address) {
      try {
        const found = findTrackedToken(options.store.all(), address);
        return found ? toolToken(found, options.now(), options.brandCreators) : null;
      } catch {
        return null;
      }
    },
    async figures() {
      try {
        return await options.figures();
      } catch {
        return null;
      }
    },
  };
}
