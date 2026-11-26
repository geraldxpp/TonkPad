import type { Locale } from "@/shared/i18n/config";
import { applyDecision, type DecideContext, decide, type ModDeps, type ModTarget } from "../mod/actions";
import type { ChatId, OffenceRecord, Records, RuleHit, Standing, UserId } from "./types";

/**
 * A link raid's copies (prompts/15-community-agent.md, The rules: Link
 * raid). Only new members' copies of a severe link make raiders
 * (mod/flood-raids.ts): the copies they posted before the raid was seen are
 * settled as the raider's own message is, a ban (LINK_RAID). Anyone else's
 * copies of a punishable raid's link are only deleted, with no offence
 * (LINK_RAID_COPY), and so are the copies of someone who wrote a strong
 * self-harm phrase in one of them (never punished). Each account gets its
 * own routine alert (a ban with Unban, a deleted copy as a note), so the
 * team sees, and can undo, every one; raid mode's one alert stays raid.ts's.
 */

export const NONE: OffenceRecord = { n: 0, certain: 0, last: 0, category: null };
export const LINK_RAID: RuleHit = { category: "link_raid", severity: "scam", certain: true, detail: "the same link from several accounts" };
/** Another account's copy of a raided link: deleted only (mod/actions-rules.ts bans only a new member's certain raid hit). */
export const LINK_RAID_COPY: RuleHit = { category: "link_raid", severity: "notice", certain: false, detail: "a copy of a raided link" };

export interface RaidCopiesDeps {
  records: Records;
  /** A person's standing from the admin list and the records. */
  standing: (chat: ChatId, user: UserId, now: number) => Standing;
  mod: ModDeps;
  groupLang: Locale;
  /** Whether a copy carried a strong self-harm phrase: an account with such a copy is never punished, only its copies deleted. */
  spared?: (chat: ChatId, messageId: number) => boolean;
}

/** Settles the given copies of a raided link by `hit` (a raider's, or another account's: LINK_RAID_COPY), one decision per account (the caller leaves out the message it decides itself). */
export function raidCopies(deps: RaidCopiesDeps, chat: ChatId, copies: ReadonlyArray<{ user: UserId; messageId: number }>, now: number, hit: RuleHit = LINK_RAID): void {
  const { records } = deps;
  const byAuthor = new Map<number, number[]>();
  for (const c of copies) byAuthor.set(c.user, [...(byAuthor.get(c.user) ?? []), c.messageId]);
  for (const [user, messageIds] of byAuthor) {
    // Someone posting as a channel is noted by that channel's (negative) ID.
    const asChat = user < 0;
    const standing: Standing = asChat ? "member" : deps.standing(chat, user, now);
    if (standing === "admin") continue;
    const isSpared = deps.spared;
    // The decision acts on every copy, so one with the phrase spares the account (prompts/15: never punished).
    const spare = isSpared !== undefined && messageIds.some((id) => isSpared(chat, id));
    const ctx: DecideContext = {
      standing, strictness: records.settings(chat).strictness, offences: asChat ? NONE : records.offences(chat, user, now), raid: true, senderChat: asChat, stale: false, spare,
    };
    const d = decide([hit], null, ctx);
    if (!d) continue;
    // The copies' text was never kept (the flood watch holds IDs only): the alert names the account and what was done.
    const target: ModTarget = {
      chat, user: asChat ? null : user, senderChat: asChat ? user : null, messageIds, name: "", username: null,
      since: asChat ? null : records.newcomerSince(chat, user, now), lang: deps.groupLang, excerpt: "", link: null, ageSeconds: 0, seenAt: now,
    };
    void applyDecision(d, target, deps.mod);
  }
}

/** A raid's 2 minutes: how long a copy's self-harm phrase is remembered (its chat and message ID only). */
const SPARED_MS = 120_000;
const SPARED_MAX = 5_000;

/** The messages with a strong self-harm phrase from the last 2 minutes, by chat and message ID, so a raid spares their authors. */
export function createSpared(): { add(chat: ChatId, messageId: number, now: number): void; has(chat: ChatId, messageId: number): boolean } {
  const seen = new Map<string, number>();
  return {
    add(chat, messageId, now) {
      // Keys go in as they are seen, oldest first, so the sweep stops at the first one still live.
      for (const [key, at] of seen) {
        if (now - at < SPARED_MS && seen.size < SPARED_MAX) break;
        seen.delete(key);
      }
      seen.set(`${chat}:${messageId}`, now);
    },
    has: (chat, messageId) => seen.has(`${chat}:${messageId}`),
  };
}
