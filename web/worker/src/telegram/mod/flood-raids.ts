import { createHash } from "node:crypto";
import type { ChatId, UserId } from "../community/types";
import { opensWithCommand } from "./links";

/**
 * Link and text raids, per group, in memory only: for 2 minutes, the user
 * and message IDs of each copy, under fingerprints of the keys and texts. A
 * link raid is the same raid key (rules-scan.ts raidKeysOf: a risky link by
 * its host and path) from 3 or more accounts within 2 minutes, whoever they
 * are: it counts toward raid mode. It is punishable only when 3 or more of
 * those accounts are new members whose copies are of a severe kind
 * (rules-scan.ts severeKeysOf: a look-alike, a drainer, a hidden-dot host or
 * an invite) and no report: only they are raiders, so a raid can never be
 * aimed at a member, nor at a newcomer by older accounts. A text raid is the
 * same text of 40 letters or more, token addresses left out, from 8 or more
 * accounts; it only counts toward raid mode. Neither ever counts an @handle,
 * a token address or a message that opens with a bot command ("/check
 * <address>"), whatever the caller passes. A report counts toward both, but
 * is never a raider.
 */

const RAID_MS = 120_000;
const LINK_RAID_ACCOUNTS = 3;
const TEXT_RAID_ACCOUNTS = 8;
const TEXT_RAID_LETTERS = 40;
/** Bounds, so a raid can't grow the maps without end between prunes. */
const COPIES_MAX = 200;
const KEYS_MAX = 5_000;

const BASE58 = "1-9A-HJ-NP-Za-km-z";
/** Token addresses as telegram/text.ts reads them: EVM, and Solana's base58. */
const ADDRESSES = new RegExp(`(?<![0-9a-zA-Z])0x[0-9a-fA-F]{40}(?![0-9a-zA-Z])|(?<![${BASE58}])[${BASE58}]{32,44}(?![${BASE58}])`, "g");
const ADDRESS = new RegExp(`^(?:0x[0-9a-fA-F]{40}|[${BASE58}]{32,44})$`);

/** One copy of a raided link: whose, and which message. */
export interface RaidCopy {
  user: UserId;
  messageId: number;
}

/** What one message brings to the raid counts (flood.ts FloodInput). */
export interface RaidNote extends RaidCopy {
  chat: ChatId;
  text: string;
  keys: readonly string[];
  /** Those of `keys` of a severe kind (a look-alike, a drainer, a hidden-dot host, an invite): only these make raiders. */
  severe?: readonly string[];
  /** The author is a new member: only new members are raiders. */
  newcomer?: boolean;
  /** A report: it counts, but is never returned as a raider. */
  exempt: boolean;
  now: number;
}

/** A link raid seen: its raiders' copies to settle (a ban), and the other accounts' copies to delete only; both empty for raid mode alone. */
export interface LinkRaid {
  raiders: RaidCopy[];
  others: RaidCopy[];
}

interface Copy extends RaidCopy {
  at: number;
  report: boolean;
  /** A new member's copy of a severe kind that isn't a report. */
  raider: boolean;
}

const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);
/** A key a link raid may count: never an @handle or a token address. */
const linkKey = (key: unknown): key is string => typeof key === "string" && key !== "" && !key.startsWith("@") && !ADDRESS.test(key);

/** Drops the oldest entries past `max` (a Map keeps insertion order). */
export function trim<K, V>(map: Map<K, V>, max: number): void {
  for (const key of map.keys()) {
    if (map.size <= max) return;
    map.delete(key);
  }
}

/** Moves a key to the end, so trim drops the least recently used first. */
function touch<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

const accounts = (copies: readonly Copy[]) => new Set(copies.map((c) => c.user)).size;

export class RaidCounter {
  private readonly copies = new Map<string, Copy[]>();
  /** When a key was last reported as a punishable raid: while copies keep coming within 2 minutes, each new one is reported alone. */
  private readonly raided = new Map<string, number>();
  private readonly texts = new Map<string, Map<UserId, number>>();

  /**
   * Null without a link raid. In one (3 accounts, whoever they are), the
   * copies to settle when it is punishable (3 raiders: new members' severe
   * copies, never a report): every copy the first time, then each new one,
   * the raiders' apart from the others'. Both can be empty, and it is a raid
   * all the same (it counts toward raid mode).
   */
  linkRaid(note: RaidNote): LinkRaid | null {
    const { chat, user, messageId, now } = note;
    if (typeof note.text === "string" && opensWithCommand(note.text)) return null;
    const keys = new Set((Array.isArray(note.keys) ? note.keys : []).filter(linkKey));
    const severe = new Set(Array.isArray(note.severe) ? note.severe : []);
    const raiders = new Map<string, RaidCopy>();
    const others = new Map<string, RaidCopy>();
    let raid = false;
    for (const key of keys) {
      const id = `${chat}|${fingerprint(key)}`;
      const copies = (this.copies.get(id) ?? []).filter((c) => now - c.at < RAID_MS);
      copies.push({ user, messageId, at: now, report: note.exempt, raider: note.newcomer === true && severe.has(key) && !note.exempt });
      touch(this.copies, id, copies.slice(-COPIES_MAX));
      if (accounts(copies) < LINK_RAID_ACCOUNTS) continue;
      raid = true;
      if (accounts(copies.filter((c) => c.raider)) < LINK_RAID_ACCOUNTS) continue;
      const last = this.raided.get(id);
      touch(this.raided, id, now);
      const report = last !== undefined && now - last < RAID_MS ? copies.slice(-1) : copies;
      for (const c of report) if (!c.report) (c.raider ? raiders : others).set(`${c.user}:${c.messageId}`, { user: c.user, messageId: c.messageId });
    }
    if (this.copies.size > KEYS_MAX) this.prune(now);
    trim(this.copies, KEYS_MAX);
    trim(this.raided, KEYS_MAX);
    if (!raid) return null;
    // A raider's other copies go with their own.
    const raiderAccounts = new Set([...raiders.values()].map((c) => c.user));
    for (const [at, c] of others) if (raiderAccounts.has(c.user)) raiders.set(at, c);
    return { raiders: [...raiders.values()], others: [...others.values()].filter((c) => !raiderAccounts.has(c.user)) };
  }

  /** Whether the message's text, from 8 or more accounts within 2 minutes, makes a text raid. */
  textRaid(note: RaidNote): boolean {
    const text = typeof note.text === "string" ? note.text : "";
    if (opensWithCommand(text)) return false;
    const letters = text.normalize("NFKC").replace(ADDRESSES, " ").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if ([...letters].length < TEXT_RAID_LETTERS) return false;
    const id = `${note.chat}|${fingerprint(letters)}`;
    const senders = this.texts.get(id) ?? new Map<UserId, number>();
    for (const [user, at] of senders) if (note.now - at >= RAID_MS) senders.delete(user);
    senders.set(note.user, note.now);
    touch(this.texts, id, senders);
    if (this.texts.size > KEYS_MAX) this.prune(note.now);
    trim(this.texts, KEYS_MAX);
    return senders.size >= TEXT_RAID_ACCOUNTS;
  }

  /** Forgets every copy, report and sender past its 2 minutes. */
  prune(now: number): void {
    for (const [id, copies] of this.copies) {
      const kept = copies.filter((c) => now - c.at < RAID_MS);
      if (kept.length > 0) this.copies.set(id, kept);
      else this.copies.delete(id);
    }
    for (const [id, at] of this.raided) if (now - at >= RAID_MS) this.raided.delete(id);
    for (const [id, senders] of this.texts) {
      for (const [user, at] of senders) if (now - at >= RAID_MS) senders.delete(user);
      if (senders.size === 0) this.texts.delete(id);
    }
  }
}
