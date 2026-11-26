import type { ChatId, Strictness, UserId } from "../community/types";
import { type Post, units, windowOf } from "./flood-units";
import { RaidCounter, type RaidCopy, trim } from "./flood-raids";

/**
 * Floods and raids, in memory only (the privacy page: message IDs and text
 * fingerprints, nothing past 10 minutes). Per member: their messages of the
 * last minute against the strictness limit (flood-units.ts counts them: an
 * album or a forward burst as one for every 5, each message once, an edit
 * only refreshing its time), the same sticker or GIF 5 times in 30 seconds,
 * more than 10 edits in 10 seconds, and their message IDs of the last 10
 * minutes (at most 20), which a scam ban deletes. Once a member floods, the
 * rest of their burst (whatever comes in the next 10 seconds) is deleted as
 * it arrives. Per group: link and text raids (flood-raids.ts).
 */

const FLOOD_MS = 10_000;
const STICKER_MS = 30_000;
const STICKER_REPEATS = 5;
const RECENT_MS = 600_000;
const RECENT_MAX = 20;
/** More than this many edits by one member in 10 seconds is a flood of its own. */
const EDITS_MAX = 10;
/** A bound, so a raid can't grow the map without end between prunes. */
const MEMBERS_MAX = 20_000;

/** Messages in 10 seconds above which a member floods: relaxed 10, normal 7, strict 5; observe reports as normal. */
export const floodLimit = (s: Strictness): number => (s === "relaxed" ? 10 : s === "strict" ? 5 : 7);

export interface FloodInput {
  chat: ChatId;
  user: UserId;
  messageId: number;
  text: string;
  /** The message's raid keys (rules-scan.ts raidKeysOf: its risky links by host and path); @handles, token addresses and a bot command's links never count. */
  keys: readonly string[];
  /** Those of `keys` of a severe kind (rules-scan.ts severeKeysOf): only a new member's severe copy makes a raider. */
  severe?: readonly string[];
  /** The author is a new member: only new members are ever raiders. */
  newcomer?: boolean;
  /** A sticker's or animation's file_unique_id. */
  sticker: string | null;
  /** Its album's media_group_id (media.ts burstOf): an album counts as one message for every 5. */
  album?: string | null;
  /** A forward's own date in unix seconds (media.ts burstOf): one member's forwards of one second count as one message for every 5. */
  forwardedAt?: number | null;
  strictness: Strictness;
  /** A report: it counts toward raid mode, but is never a raider. */
  exempt: boolean;
  /** An edit: it refreshes its message's time and feeds the raid counts, but is never a new message; more than 10 in 10 seconds flood. */
  edit?: boolean;
  now: number;
}

export interface FloodResult {
  /** The burst to delete, each message once, when the member floods (once per burst). */
  flood: number[] | null;
  /** The member flooded within the last 10 seconds and this message is more of that burst: delete it too, with no new offence. */
  rest: boolean;
  /**
   * Null without a link raid. In one, its raiders' copies to settle (new
   * members' severe copies, reports left out): every copy the first time, then
   * each new one. It can be empty: a raid all the same, for raid mode.
   */
  linkRaid: RaidCopy[] | null;
  /** In a punishable link raid, the other accounts' copies (members', a newcomer's plain one): deleted only, never punished. */
  linkOthers: RaidCopy[];
  textRaid: boolean;
}

interface Seen {
  /** The last 10 minutes, at most 20, each message once: what a ban deletes. */
  recent: Array<{ messageId: number; at: number }>;
  /** The last minute's messages, each once (an edit refreshes its time): what the limits count. */
  window: Post[];
  /** When each edit of the last 10 seconds came, and of which message. */
  edits: Array<{ messageId: number; at: number }>;
}

const member = (chat: ChatId, user: UserId) => `${chat}:${user}`;

function unitOf(input: FloodInput): string | null {
  const { album, forwardedAt } = input;
  if (typeof album === "string" && album !== "") return `a:${album}`;
  return typeof forwardedAt === "number" && Number.isSafeInteger(forwardedAt) ? `f:${forwardedAt}` : null;
}

/** Each message ID once, oldest first. */
const idsOf = (posts: ReadonlyArray<{ messageId: number }>) => [...new Set(posts.map((p) => p.messageId))];

export class FloodWatch {
  private readonly seen = new Map<string, Seen>();
  /** When a member's last flood was reported: one report per burst, and the rest of it deleted as it comes. */
  private readonly flooded = new Map<string, number>();
  private readonly raids = new RaidCounter();

  constructor(private readonly limits: (s: Strictness) => number = floodLimit) {}

  /** Notes one message (or an edit) and says whether it is part of a flood or a raid. */
  note(input: FloodInput): FloodResult {
    const { chat, user, now } = input;
    const who = member(chat, user);
    const before = this.seen.get(who);
    const edit = input.edit === true;
    const cooling = now - (this.flooded.get(who) ?? Number.NEGATIVE_INFINITY) < FLOOD_MS;
    const recent = (before?.recent ?? []).filter((p) => now - p.at < RECENT_MS && p.messageId !== input.messageId);
    recent.push({ messageId: input.messageId, at: now });
    const edits = (before?.edits ?? []).filter((e) => now - e.at < FLOOD_MS);
    if (edit) edits.push({ messageId: input.messageId, at: now });
    // The rest of a burst that flooded is deleted with it, never counted again.
    const rest = cooling && !edit;
    const window = rest ? windowOf(before?.window ?? [], now) : windowOf(before?.window ?? [], now, { messageId: input.messageId, at: now, sticker: input.sticker, unit: unitOf(input) }, edit);
    const seen: Seen = { recent: recent.slice(-RECENT_MAX), window, edits: edits.slice(-(EDITS_MAX + 1)) };
    this.seen.delete(who);
    this.seen.set(who, seen);
    trim(this.seen, MEMBERS_MAX);
    const raid = this.raids.linkRaid(input);
    const flood = cooling ? null : edit ? this.editFlood(who, seen, now) : this.flood(who, seen, input);
    return { flood, rest, linkRaid: raid ? raid.raiders : null, linkOthers: raid?.others ?? [], textRaid: this.raids.textRaid(input) };
  }

  private report(who: string, seen: Seen, ids: number[], now: number): number[] {
    this.flooded.set(who, now);
    // Deleted now: never counted, nor deleted, again.
    const gone = new Set(ids);
    seen.window = seen.window.filter((p) => !gone.has(p.messageId));
    return ids;
  }

  private flood(who: string, seen: Seen, input: FloodInput): number[] | null {
    const { now } = input;
    const limit = this.limits(input.strictness);
    const burst = seen.window.filter((p) => now - p.at < FLOOD_MS);
    if (units(burst) > limit || burst.length > limit * 2) return this.report(who, seen, idsOf(burst), now);
    if (seen.window.length > limit * 4) return this.report(who, seen, idsOf(seen.window), now);
    const same = input.sticker === null ? [] : seen.window.filter((p) => p.sticker === input.sticker && now - p.at < STICKER_MS);
    return units(same) >= STICKER_REPEATS ? this.report(who, seen, idsOf(same), now) : null;
  }

  /** More than 10 edits in 10 seconds: the edited messages, each once. */
  private editFlood(who: string, seen: Seen, now: number): number[] | null {
    return seen.edits.length > EDITS_MAX ? this.report(who, seen, idsOf(seen.edits), now) : null;
  }

  /** A member's message IDs from the last 10 minutes, at most 20, each once, oldest first. */
  recent(chat: ChatId, user: UserId, now: number): number[] {
    return idsOf((this.seen.get(member(chat, user))?.recent ?? []).filter((p) => now - p.at < RECENT_MS));
  }

  /** Forgets everything past its window; nothing outlives 10 minutes. */
  prune(now: number): void {
    for (const [who, seen] of this.seen) {
      const kept: Seen = { recent: seen.recent.filter((p) => now - p.at < RECENT_MS), window: windowOf(seen.window, now), edits: seen.edits.filter((e) => now - e.at < FLOOD_MS) };
      if (kept.recent.length > 0) this.seen.set(who, kept);
      else this.seen.delete(who);
    }
    for (const [who, at] of this.flooded) if (now - at >= FLOOD_MS) this.flooded.delete(who);
    this.raids.prune(now);
  }
}
