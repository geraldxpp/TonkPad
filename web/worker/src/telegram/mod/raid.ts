import type { Locale } from "@/shared/i18n/config";
import type { ChatId, ChatSettings, RaidControl } from "../community/types";
import { escapeHtml as esc } from "../text";
import type { ModDeps } from "./actions";
import { NOTICE_MS, noticeHtml, reviewButton, sendAndExpire } from "./notices";

/**
 * Raid mode (prompts/15-community-agent.md, Raid mode). It starts when 10
 * people join within a minute, the rules act 8 times within a minute, a link
 * or text raid is seen, or an admin starts it; it lasts 30 minutes, extended
 * while the signals continue. Meanwhile the check is the hard one, no
 * unprompted answers go out, link messages skip Haiku, and notices are
 * summed up every 5 minutes. One group notice and one alert as it starts, one
 * of each as it ends; a group the agent stops running (dropChat) has its
 * raid ended quietly instead. Its windows hold times only, never a user ID.
 */

export interface RaidWatch extends RaidControl {
  noteJoin(chat: ChatId, now: number): void;
  noteAction(chat: ChatId, now: number): void;
  noteRaid(chat: ChatId, kind: "link" | "text", now: number): void;
  /** Ends raids past their time and posts each raid's 5-minute summary. */
  tick(now: number): Promise<void>;
  /** A group the agent stops running: its raid ends without a notice or an alert, and it is watched no more. */
  dropChat(chat: ChatId): void;
}

export interface RaidDeps extends ModDeps {
  groupLang: Locale;
  settings: (chat: ChatId) => ChatSettings;
  update: (chat: ChatId, patch: Partial<ChatSettings>) => void;
  /** The community groups, so a raid saved before a restart still ends on time; chats seen since are watched too. */
  chats?: readonly ChatId[];
}

export const RAID_MS = 30 * 60_000;
const WINDOW_MS = 60_000;
const JOINS = 10;
const ACTIONS = 8;
const SUMMARY_MS = 5 * 60_000;
/** The raid notice goes when the raid ends; this is only a backstop if the worker restarts meanwhile. */
const NOTICE_BACKSTOP_MS = 47 * 60 * 60_000;

interface ChatWatch {
  joins: number[];
  actions: number[];
  /** The group notice "Raid protection is on", deleted when the raid ends. */
  notice: number | null;
  /** The day's removed count at the last summary, and when that was. */
  base: number | null;
  summarizedAt: number;
}

export function createRaidWatch(deps: RaidDeps): RaidWatch {
  const watches = new Map<ChatId, ChatWatch>();
  /** Groups the agent no longer runs: never watched again. */
  const dropped = new Set<ChatId>();
  for (const chat of deps.chats ?? []) watches.set(chat, fresh());

  function fresh(): ChatWatch {
    return { joins: [], actions: [], notice: null, base: null, summarizedAt: 0 };
  }
  const watch = (chat: ChatId): ChatWatch => {
    let w = watches.get(chat);
    if (!w) watches.set(chat, (w = fresh()));
    return w;
  };
  const active = (chat: ChatId, now: number) => deps.settings(chat).raidUntil > now;
  const observing = (chat: ChatId) => deps.settings(chat).strictness === "observe";
  const removedToday = (chat: ChatId, now: number) => deps.records.counts(chat, now).removed;

  /** The admins hear of it once as it starts and once as it ends; End raid mode is on the alert. */
  function alert(chat: ChatId, on: boolean): void {
    const d = deps.words(deps.adminLang ?? "en");
    deps.alerts.alert({
      chat, kind: "raid", category: null, member: null, excerpt: null, link: null, done: on ? d.raid.on : d.raid.off,
      aiGuess: null, undo: null, messageId: null, routine: true, urgent: false,
    });
  }

  /** The group notice, in the group's language; observe mode tells only the admins, since nothing changes for members. */
  async function announce(chat: ChatId, on: boolean): Promise<void> {
    if (observing(chat)) return;
    const html = esc(deps.words(deps.groupLang).raid[on ? "on" : "off"]);
    const id = await sendAndExpire(deps, chat, html, { kind: "notice" }, on ? NOTICE_BACKSTOP_MS : NOTICE_MS);
    if (!on || id === null) return;
    // It went out after the raid had already ended: it goes at once.
    if (active(chat, deps.now())) watch(chat).notice = id;
    else deps.out.remove(chat, [id]);
  }

  /** "Messages removed in the last minutes: N", from the day's removed count since the last summary. */
  async function summarize(chat: ChatId, now: number): Promise<void> {
    const w = watch(chat);
    const removed = removedToday(chat, now);
    const base = w.base ?? removed;
    // The count starts again at 00:00 UTC: everything since then is new.
    const count = removed >= base ? removed - base : removed;
    w.base = removed;
    w.summarizedAt = now;
    if (count <= 0) return;
    const d = deps.words(deps.groupLang);
    const review = reviewButton(d, deps);
    const html = noticeHtml("summary", d, { count: String(count) });
    await sendAndExpire(deps, chat, html, { kind: "notice", keyboard: review ? { inline_keyboard: [[review]] } : undefined }, NOTICE_MS);
  }

  function start(chat: ChatId, reason: string, now: number): void {
    if (dropped.has(chat)) return;
    const until = now + RAID_MS;
    const settings = deps.settings(chat);
    // On, or just past its time and not yet ended by the tick: it goes on, with no second notice.
    if (settings.raidUntil > 0) {
      if (until > settings.raidUntil) deps.update(chat, { raidUntil: until });
      return;
    }
    deps.update(chat, { raidUntil: until });
    const w = watch(chat);
    w.base = removedToday(chat, now);
    w.summarizedAt = now;
    deps.log?.(`raid mode on (${reason.replace(/[^a-z]/gi, "").slice(0, 16) || "signal"})`);
    alert(chat, true);
    void announce(chat, true);
  }

  async function finish(chat: ChatId, now: number): Promise<void> {
    if (deps.settings(chat).raidUntil === 0) return;
    deps.update(chat, { raidUntil: 0 });
    const w = watch(chat);
    deps.log?.("raid mode off");
    alert(chat, false);
    if (w.notice !== null) deps.out.remove(chat, [w.notice]);
    w.notice = null;
    await summarize(chat, now);
    w.base = null;
    await announce(chat, false);
  }

  /** Counts a signal in its window; at the threshold it starts raid mode, or keeps it going. */
  function signal(chat: ChatId, list: "joins" | "actions", threshold: number, now: number): void {
    if (dropped.has(chat)) return;
    const w = watch(chat);
    w[list] = [...w[list].filter((at) => now - at < WINDOW_MS), now];
    if (w[list].length >= threshold) start(chat, list, now);
  }

  return {
    active,
    start,
    end: (chat, now) => void finish(chat, now).catch(() => deps.log?.("raid mode didn't end cleanly")),
    noteJoin: (chat, now) => signal(chat, "joins", JOINS, now),
    noteAction: (chat, now) => signal(chat, "actions", ACTIONS, now),
    noteRaid: (chat, kind, now) => start(chat, kind, now),
    async tick(now) {
      for (const [chat, w] of watches) {
        w.joins = w.joins.filter((at) => now - at < WINDOW_MS);
        w.actions = w.actions.filter((at) => now - at < WINDOW_MS);
        try {
          const until = deps.settings(chat).raidUntil;
          if (until > 0 && until <= now) await finish(chat, now);
          else if (until > now && now - w.summarizedAt >= SUMMARY_MS) await summarize(chat, now);
        } catch {
          deps.log?.("raid check failed");
        }
      }
    },
    dropChat(chat) {
      dropped.add(chat);
      const w = watches.get(chat);
      watches.delete(chat);
      if (deps.settings(chat).raidUntil !== 0) deps.update(chat, { raidUntil: 0 });
      // Its "Raid protection is on" notice goes with it; nothing new is posted.
      if (w && w.notice !== null) deps.out.remove(chat, [w.notice]);
    },
  };
}
