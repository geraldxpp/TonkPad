import { ALERT_LAUNCHPADS, type AlertLaunchpad, type LiveLaunch } from "@/shared/types/live";
import { MAX_SEEN } from "./storage";
import type { AlertRule, AlertSettings, FeedItem, LaunchSeen } from "./types";

const isAlertPad = (pad: string): pad is AlertLaunchpad => (ALERT_LAUNCHPADS as readonly string[]).includes(pad);

/** A level re-arms once the figure is this far back on the other side of the line (1%). */
export const LEVEL_BAND = 0.01;
/** A move re-arms once it has eased below this share of its size. */
export const MOVE_BAND = 0.8;

export interface Quote {
  priceUsd: number;
  marketCap: number;
  change1h: number;
  change24h: number;
}

/** A feed item before it has an id, a time and its read flag. */
export type FeedDraft = Omit<FeedItem, "id" | "at" | "read">;

/**
 * Checks one rule against the market now. A rule fires once when its
 * condition turns true, then waits until the condition has cleared again
 * (by a margin), so a price hovering at the line doesn't fire over and over.
 */
export function checkRule(rule: AlertRule, quote: Quote): { fired: FeedDraft | null; armed: boolean } {
  if (rule.kind === "move") {
    const change = rule.window === "1h" ? quote.change1h : quote.change24h;
    const size = Math.abs(change);
    if (rule.armed && size >= rule.percent) {
      return { fired: { kind: change >= 0 ? "moveUp" : "moveDown", token: rule.token, value: Math.round(size * 10) / 10, window: rule.window }, armed: false };
    }
    return { fired: null, armed: rule.armed || size < rule.percent * MOVE_BAND };
  }
  const figure = rule.kind === "price" ? quote.priceUsd : quote.marketCap;
  const above = rule.direction === "above";
  const met = above ? figure >= rule.value : figure <= rule.value;
  if (rule.armed && met) {
    const kind = rule.kind === "price" ? (above ? "priceAbove" : "priceBelow") : above ? "mcapAbove" : "mcapBelow";
    return { fired: { kind, token: rule.token, value: rule.value }, armed: false };
  }
  const cleared = above ? figure < rule.value * (1 - LEVEL_BAND) : figure > rule.value * (1 + LEVEL_BAND);
  return { fired: null, armed: rule.armed || cleared };
}

/** Whether a new rule's level is on the far side of the figure now, so it can fire when crossed. */
export function levelValid(direction: "above" | "below", value: number, now: number): boolean {
  return Number.isFinite(value) && value > 0 && (direction === "above" ? value > now : value < now);
}

const sameAddress = (a: string, b: string) => (a.startsWith("0x") ? a.toLowerCase() === b.toLowerCase() : a === b);

/** A busy launchpad reports at most this many launchpad-wide alerts per check, so a rush doesn't flood the feed. */
export const PER_PAD_CAP = 5;

/**
 * What changed on the launchpads since the last check: tonkfun.fun's new
 * launches; each switched-on launchpad's graduations and launches turning
 * hot; and for watched tokens a graduation (any launchpad) or a tonkfun.fun
 * lock ending, claimed or extended. A first check, and a launchpad seen for
 * the first time, only record, so switching on never floods the feed with
 * old news.
 */
export function diffLaunches(
  seen: LaunchSeen | null,
  launches: readonly LiveLaunch[],
  settings: AlertSettings,
  watched: readonly string[],
  now: number,
): { drafts: FeedDraft[]; seen: LaunchSeen } {
  const drafts: FeedDraft[] = [];
  const perPad = new Map<string, number>();
  const padDraft = (pad: AlertLaunchpad, draft: FeedDraft) => {
    const count = perPad.get(pad) ?? 0;
    if (count >= PER_PAD_CAP) return;
    perPad.set(pad, count + 1);
    drafts.push(draft);
  };
  const tokens: LaunchSeen["tokens"] = {};
  const graduated: LaunchSeen["graduated"] = { ...seen?.graduated };
  const hotBefore = new Set(seen?.hot ?? []);
  const hotNow = new Set<string>();
  let newest = seen?.newest ?? 0;
  const known = (pad: AlertLaunchpad) => seen !== null && seen.graduated[pad] !== undefined;

  for (const launch of launches) {
    const token = { address: launch.address, chain: launch.chain, symbol: launch.symbol, name: launch.name };
    const pad = isAlertPad(launch.launchpad) ? launch.launchpad : null;
    const before = seen?.tokens[launch.address];
    const isWatched = watched.some((w) => sameAddress(w, launch.address));
    if (seen && settings.launches && launch.launchpad === "tonk" && launch.launchedAt > seen.newest) padDraft("tonk", { kind: "launch", token, pad: "tonk" });
    if (pad && known(pad) && launch.graduatedAt !== null && launch.graduatedAt > (seen?.graduated[pad] ?? Infinity)) {
      if (settings.pads[pad].graduations && !isWatched) padDraft(pad, { kind: "graduated", token, pad });
    }
    if (pad && launch.hot) {
      hotNow.add(launch.address);
      if (known(pad) && settings.pads[pad].hot && !hotBefore.has(launch.address)) padDraft(pad, { kind: "hot", token, pad });
    }
    if (seen && before && isWatched) {
      if (settings.graduations && before.graduatedAt === null && launch.graduatedAt !== null) drafts.push({ kind: "graduated", token, ...(pad ? { pad } : {}) });
      if (settings.locks && launch.lockEnd !== null && before.lockEnd !== null) {
        if (launch.lockEnd > before.lockEnd) drafts.push({ kind: "extended", token });
        else if (launch.lockEnd > seen.checkedAt && launch.lockEnd <= now) drafts.push({ kind: "unlocked", token });
        if (launch.lockClaimed !== null && before.lockClaimed !== null && BigInt(launch.lockClaimed) > BigInt(before.lockClaimed)) {
          drafts.push({ kind: "claimed", token });
        }
      }
    }
    tokens[launch.address] = { graduatedAt: launch.graduatedAt, lockEnd: launch.lockEnd, lockClaimed: launch.lockClaimed };
    if (launch.launchpad === "tonk") newest = Math.max(newest, launch.launchedAt);
    if (pad && launch.graduatedAt !== null) graduated[pad] = Math.max(graduated[pad] ?? 0, launch.graduatedAt);
  }
  // Every followed launchpad counts as seen from now on, even with no graduation listed yet.
  for (const pad of ALERT_LAUNCHPADS) graduated[pad] ??= 0;
  const hot = [...new Set([...hotBefore, ...hotNow])].slice(-MAX_SEEN);
  // Launch times are the chain's and the worker's, so the newest ones seen (not this browser's clock) mark what counts as new.
  return { drafts, seen: { newest, checkedAt: now, tokens, graduated, hot } };
}
