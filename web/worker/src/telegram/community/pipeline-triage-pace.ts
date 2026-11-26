import { createHash } from "node:crypto";
import { visibleText } from "../../text";
import type { TgMessage } from "../types";
import { textOf } from "./pipeline-mod-input";
import type { ChatId, RuleResult } from "./types";

/**
 * How often Haiku's check runs for one member and for one message
 * (prompts/15-community-agent.md, Per-user and per-chat limits), in memory
 * only. A member gets at most 3 checks a minute in a group, so one member
 * can't spend the group's 30. An edit is checked again only when what the
 * check reads in it changed (its text, or what the rules found), and at
 * most once a minute per message. Past either pace the check waits for its
 * turn (pipeline-triage-later.ts), and `free` and `due` say when that is.
 * It holds chat, member and message IDs and a fingerprint, never text, and
 * nothing outlives 10 minutes.
 */

const MINUTE = 60_000;
/** Checks one member may have in a group per minute. */
export const MEMBER_CHECKS = 3;
/** An edited message is checked again at most once a minute. */
const EDIT_GAP_MS = MINUTE;
/** A message's fingerprint is kept this long (the privacy page's 10 minutes). */
const KEEP_MS = 10 * MINUTE;
/** Bounds, so a raid can't grow the maps between prunes. */
const MAX = 20_000;

/** A new message; an edit that changed nothing the check reads; one checked under a minute ago; one to check. */
export type Seen = "new" | "same" | "soon" | "changed";

interface Known {
  print: string;
  /** When its last check went out (ms), or null. */
  checked: number | null;
  at: number;
}

/** What the check reads in a message, as a fingerprint: its visible words (case and spacing aside) and what the rules found. */
export function printOf(m: TgMessage, r: RuleResult): string {
  const words = visibleText(textOf(m).text).normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  const k = r.markers;
  const rules = [
    r.hits.map((h) => `${h.category}:${h.severity}`).sort(), k.question, [...k.domains].sort(), [...k.linkKeys].sort(), k.unknownLinks,
    k.handles, [...k.addresses].sort(), k.helpWords, k.dmWords, k.reportWords, k.crisis,
  ];
  return createHash("sha256").update(JSON.stringify([words, rules])).digest("hex").slice(0, 32);
}

/** Drops the oldest entries past MAX (a Map keeps insertion order). */
function bound<V>(map: Map<string, V>): void {
  for (const key of map.keys()) {
    if (map.size <= MAX) return;
    map.delete(key);
  }
}

export function createCheckPace() {
  /** "<chat>:<member>" → when their checks went out in the last minute. */
  const members = new Map<string, number[]>();
  /** "<chat>:<message>" → its fingerprint and last check. */
  const messages = new Map<string, Known>();
  const recent = (key: string, now: number) => (members.get(key) ?? []).filter((at) => now - at < MINUTE);

  return {
    /** Notes a new message's fingerprint; for an edit, says whether it needs a check, and keeps the new fingerprint only when it may get one. */
    seen(chat: ChatId, messageId: number, print: string, edit: boolean, now: number): Seen {
      const key = `${chat}:${messageId}`;
      const known = messages.get(key);
      const live = known && now - known.at < KEEP_MS ? known : null;
      if (!edit || !live) {
        messages.delete(key);
        messages.set(key, { print, checked: null, at: now });
        bound(messages);
        return edit ? "changed" : "new";
      }
      if (live.print === print) return "same";
      // Checked under a minute ago: the old fingerprint stays, so the change is checked once the minute is over.
      if (live.checked !== null && now - live.checked < EDIT_GAP_MS) return "soon";
      live.print = print;
      return "changed";
    },

    /** Whether this member (or channel identity) has a check left this minute in this group. */
    room(chat: ChatId, author: number, now: number): boolean {
      return recent(`${chat}:${author}`, now).length < MEMBER_CHECKS;
    },

    /** When this member gets a check back in this group: now when they have one, else when the oldest of their last minute's turns a minute old. */
    free(chat: ChatId, author: number, now: number): number {
      const times = recent(`${chat}:${author}`, now);
      return times.length < MEMBER_CHECKS ? now : Math.min(...times) + MINUTE;
    },

    /** When a message's minute since its last check ends (ms): an edit within it waits until then; null when it wasn't checked in the last 10 minutes. */
    due(chat: ChatId, messageId: number, now: number): number | null {
      const known = messages.get(`${chat}:${messageId}`);
      return known && known.checked !== null && now - known.at < KEEP_MS ? known.checked + EDIT_GAP_MS : null;
    },

    /** Counts a check that went out, for its member and its message. */
    use(chat: ChatId, author: number | null, messageId: number, now: number): void {
      if (author !== null) {
        const key = `${chat}:${author}`;
        const times = [...recent(key, now), now];
        // Moved to the end, so the bound drops the longest-quiet members first.
        members.delete(key);
        members.set(key, times);
        bound(members);
      }
      const seen = messages.get(`${chat}:${messageId}`);
      if (seen) seen.checked = now;
    },

    prune(now: number): void {
      for (const [key, times] of members) if (times.every((at) => now - at >= MINUTE)) members.delete(key);
      for (const [key, seen] of messages) if (now - seen.at >= KEEP_MS) messages.delete(key);
    },
  };
}

export type CheckPace = ReturnType<typeof createCheckPace>;
