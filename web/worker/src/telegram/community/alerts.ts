import type { Locale } from "@/shared/i18n/config";
import type { InlineKeyboard } from "../types";
import { type Batch, DIGEST_MS, hold, newBatch, ownMessage, repeatKey, take, waiting } from "./alerts-batch";
import { alertKeyboard } from "./alerts-buttons";
import { createPace } from "./alerts-pace";
import { alertHtml, digestHtml, type ViewContext } from "./alerts-view";
import type { CommunityOut } from "./out";
import type { AdminAlert, ChatId, Records } from "./types";
import type { CommunityDictionary } from "./words";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The same member and case alert once per 10 minutes. */
const DEDUPE_MS = 10 * MINUTE;
/** More alerts than this in a minute become one summary a minute. */
const STORM_MAX = 6;
const STORM_MS = MINUTE;
/** Routine alerts are deleted after 47 hours: a bot may delete its own messages for 48. */
const ROUTINE_MS = 47 * HOUR;
/** A public group's username: 4 to 32 letters, digits and underscores. */
const GROUP_NAME = /^[A-Za-z0-9_]{4,32}$/;
/** A supergroup's ID is -100 followed by its own: -1001234567890 is 1234567890 in its links. */
const SUPERGROUP = 1_000_000_000_000;

/**
 * A link to a message for the team: t.me/<username>/<id> in a public group,
 * else t.me/c/<own id>/<id>, which opens for the group's members. With the
 * forum topic's `thread` (pass it only for a topic message), the topic form
 * t.me/…/<thread>/<id>. Null for a basic group, which has no message links.
 */
export function messageLink(chat: { id: ChatId; username?: string }, messageId: number, thread?: number): string | null {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return null;
  const topic = thread !== undefined && Number.isSafeInteger(thread) && thread > 0 ? `${thread}/` : "";
  if (typeof chat.username === "string" && GROUP_NAME.test(chat.username)) return `https://t.me/${chat.username}/${topic}${messageId}`;
  if (!Number.isSafeInteger(chat.id)) return null;
  const own = -chat.id - SUPERGROUP;
  return own > 0 ? `https://t.me/c/${own}/${topic}${messageId}` : null;
}

export interface AlertsDeps {
  out: CommunityOut;
  records: Records;
  adminChat: ChatId;
  /** The admins' words (TELEGRAM_ADMIN_LANG). */
  words: CommunityDictionary;
  now: () => number;
  /** A community group's title, as getChat gave it (cleaned here). */
  groupTitle: (chat: ChatId) => string;
  /** The admins' language, for plural forms ("2 hours"); English when not given. */
  lang?: Locale;
}

/** Cases whose routine alert with nothing to undo is a delete alone: an unknown link, a brand-named forward, a raided link's copy. */
const ROUTINE_DELETES: ReadonlySet<AdminAlert["category"]> = new Set<AdminAlert["category"]>(["unknown_link", "brand_forward", "link_raid"]);

/**
 * What waits for the digest: observe reports, previews, a newcomer's
 * first-link note, a newcomer removed after the check (an action with
 * nothing to undo and no rule), and a routine delete with nothing to undo
 * (an unknown link, a brand-named forward, a raided link's copy). Anything
 * with an Undo (a banned raider's Unban included) or that needs a person
 * keeps its own alert.
 */
export function digested(a: AdminAlert): boolean {
  if (a.urgent) return false;
  if (a.kind === "observe" || a.kind === "preview") return true;
  if (a.kind !== "action" || a.undo !== null) return false;
  return a.category === "newcomer_link" || a.category === null || (a.routine && ROUTINE_DELETES.has(a.category));
}

/** The admin chat's alerts: alert() takes, when it waited before reaching here (at the admin chat's gate), when it was raised. */
export interface Alerts {
  alert(a: AdminAlert, raised?: number): void;
  tick(now: number): Promise<void>;
  prune(now: number): void;
}

/**
 * The team's admin chat. Each alert is written by code (alerts-view.ts,
 * alerts-buttons.ts) and sent at once, except: the same member and case
 * (kind, group, case and undo, and for a report, an unsure check or an
 * escalation the message) alert once per 10 minutes, though an admin's
 * control changes are always confirmed, and a repeat of an action that
 * offers an Undo joins the digest rather than vanish; past 6 alerts a minute
 * the rest wait for one summary a minute, except those with an Undo, Unmute
 * or Unban and the raid alert, which keep their own message and buttons and
 * go one at a time, in order (alerts-pace.ts); observe reports, previews,
 * newcomer notes and routine link deletes wait for a digest (digested()
 * above). A member at risk (urgent) never waits. A batch goes out 9 minutes
 * 30 seconds after its oldest alert was raised at the latest, counted from
 * the alert's own creation (an alert that waited at the gate brings it
 * forward), so no name or excerpt stays in memory past 10 minutes with its
 * send's wait in the admin chat's queue. Routine alerts are deleted after 47
 * hours; cases that need a person stay for the chat's own one-week timer.
 * Nothing here is saved. Each batch goes out at its due time on a timer of
 * its own, so a tick held up elsewhere (a raid's checks) can't keep names
 * and excerpts longer; tick() sends what is due as a backstop, and prune()
 * forgets the dedupe keys without sending anything. alert() never throws
 * and tick() never rejects, so neither can break what called it.
 */
export function createAlerts(deps: AlertsDeps): Alerts {
  const { out, records, adminChat, words } = deps;
  const lang = deps.lang ?? "en";
  const seen = new Map<string, number>();
  let sent: number[] = [];
  const storm = newBatch();
  const digest = newBatch();
  const context = (now: number): ViewContext => ({ words, lang, now, groupTitle: deps.groupTitle });

  /** True once the alert went out. */
  async function deliver(html: string, keyboard: InlineKeyboard | undefined, routine: boolean): Promise<boolean> {
    try {
      const id = await out.send(adminChat, html, keyboard ? { kind: "alert", keyboard } : { kind: "alert" });
      if (id !== null && routine) records.scheduleDelete(adminChat, id, deps.now() + ROUTINE_MS);
      return id !== null;
    } catch {
      // CommunityOut doesn't throw; even so, a failed alert must never reach the update loop.
      return false;
    }
  }

  /** One alert as its own message, with its buttons; counted toward the storm. */
  function single(a: AdminAlert): Promise<boolean> {
    const now = deps.now();
    sent.push(now);
    return deliver(alertHtml(a, context(now)), alertKeyboard(a, words), a.routine && !a.urgent);
  }

  function forget(now: number): void {
    // Keys go in as they are seen, oldest first, so the sweep stops at the first one still live.
    for (const [key, at] of seen) {
      if (now - at < DEDUPE_MS) break;
      seen.delete(key);
    }
    sent = sent.filter((at) => now - at < STORM_MS);
  }

  /** True when the same member and case alerted within 10 minutes (alerts-batch.ts repeatKey). */
  function duplicate(a: AdminAlert, now: number): boolean {
    const key = repeatKey(a);
    if (key === null) return false;
    if (seen.has(key)) return true;
    seen.set(key, now);
    return false;
  }

  async function flush(batch: Batch, now: number): Promise<void> {
    const held = take(batch);
    if (!held) return;
    // Deleted after 47 hours only when every item is routine.
    await deliver(digestHtml(held.items, held.extra, context(now)), undefined, held.items.every((a) => a.routine && !a.urgent));
  }

  const send = (batch: Batch) => () => void flush(batch, deps.now()).catch(() => undefined);
  const wait = (batch: Batch, a: AdminAlert, now: number, due: number) => hold(batch, a, now, due, send(batch));
  // An alert that waited its whole time for its own turn joins a summary that goes at once.
  const pace = createPace({ send: single, late: (a) => wait(storm, a, deps.now(), deps.now()), deadline: (raised) => raised + DIGEST_MS, now: deps.now });

  return {
    alert(a, raised) {
      try {
        const now = deps.now();
        const at = typeof raised === "number" && Number.isFinite(raised) ? Math.min(raised, now) : now;
        forget(now);
        const repeat = duplicate(a, now);
        // A repeat goes, unless it took an action an admin may want to undo: then the digest lists it.
        if (repeat && !(a.kind === "action" && a.undo !== null)) return;
        if (repeat || digested(a)) return wait(digest, a, now, at + DIGEST_MS);
        const storming = !a.urgent && sent.length >= STORM_MAX;
        if (!a.urgent && ownMessage(a) && (storming || pace.waiting() > 0)) return pace.push(a, at);
        if (storming) return wait(storm, a, now, Math.min(now + STORM_MS, at + DIGEST_MS));
        void single(a);
      } catch {
        // An alert must never break the moderation or answer that raised it.
      }
    },

    async tick(now) {
      forget(now);
      const due = [storm, digest].filter((b) => waiting(b) && now >= b.due);
      // Never rejects: a digest that can't be written is dropped, not retried every tick.
      await Promise.all(due.map((b) => flush(b, now).catch(() => undefined)));
    },

    prune(now) {
      forget(now);
    },
  };
}
