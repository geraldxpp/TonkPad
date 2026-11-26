import type { Locale } from "@/shared/i18n/config";
import type { CommunityOut } from "../community/out";
import { MUTED } from "../community/permissions";
import { type AlertSink, type ChatId, type Decision, ESCALATIONS, type ModAction, type Records, type UserId } from "../community/types";
import type { CommunityDictionary } from "../community/words";
import { escapeHtml as esc } from "../text";
import { alertOf, noticeOf } from "./actions-alert";
import { leftSince } from "./actions-left";
import { DAY_S } from "./ladder";
import { durationText, postNotice } from "./notices";

export { decide, decideBot, type DecideContext, type ModDecision } from "./actions-decide";

/** Who and what a decision acts on. */
export interface ModTarget {
  chat: ChatId;
  /** The member, or null for someone posting as a channel. */
  user: UserId | null;
  /** The channel identity someone posted as, or null. */
  senderChat: number | null;
  /** The messages to delete: the message itself, a flood's burst, or a raid's copies. */
  messageIds: number[];
  /** The forum topic, so a notice lands where the message was. */
  thread?: number;
  /** For the admins' alert only: never shown in the group. */
  name: string;
  username: string | null;
  /** When the member joined (ms), when the bot knows it (a newcomer it saw join); for the admins' alert only. */
  since?: number | null;
  /** The notice's language. */
  lang: Locale;
  /** A short cleaned excerpt for the alert ("" for none); never sent for a secret or a flaw report. */
  excerpt: string;
  /** The message's link (alerts.ts messageLink), or null. */
  link: string | null;
  /** The message's age: past 47 hours a bot can no longer delete it. */
  ageSeconds: number;
  /** When the bot saw the message (ms): a late verdict records no offence for an author who has left since. */
  seenAt?: number;
}

export interface ModDeps {
  out: CommunityOut;
  records: Records;
  words: (lang: Locale) => CommunityDictionary;
  alerts: AlertSink;
  /** The member's message IDs from the last 10 minutes (FloodWatch.recent): removed on a ban. */
  recentIds: (chat: ChatId, user: UserId, now: number) => number[];
  /** The bot's username, for the review button (t.me/<bot>?start=appeal). */
  bot: () => string | null;
  now: () => number;
  /** TELEGRAM_ADMIN_LANG, for an alert's "done" line; English when not given. */
  adminLang?: Locale;
  /** The site's origin, for the Security and Privacy buttons; without it they are left out. */
  site?: string;
  /** Logs a failure, never with text or IDs. */
  log?: (line: string) => void;
}

/** A bot may delete a message for 48 hours; past 47 the bot leaves it to an admin. */
const DELETE_LIMIT_S = 47 * 3_600;
const DEL: ModAction = { kind: "delete" };
const ESCALATED: ReadonlySet<string> = new Set<string>(ESCALATIONS);
const COUNTER = { warn: "warned", mute: "muted", ban: "banned", ban_sender_chat: "banned", kick: "kicked" } as const;

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
const isSanction = (a: ModAction) => a.kind === "mute" || a.kind === "ban" || a.kind === "kick" || a.kind === "ban_sender_chat";

/** What the deletes left for the queue: the sanctions to try, and whether the message was removed or left to an admin. */
interface Removed {
  actions: readonly ModAction[];
  byHand: boolean;
  removed: boolean;
}

/** One sanction through Telegram; true when it took. */
async function sanction(a: ModAction, t: ModTarget, deps: ModDeps): Promise<boolean> {
  const { out } = deps;
  if (a.kind === "ban_sender_chat") return t.senderChat !== null && (await out.banSenderChat(t.chat, t.senderChat));
  if (t.user === null || a.kind === "delete") return false;
  if (a.kind === "warn") return true;
  // Its end is worked out at the moment of the call: Telegram reads under 30 seconds ahead as forever.
  if (a.kind === "mute") return out.restrict(t.chat, t.user, MUTED, Math.floor(deps.now() / 1000) + a.seconds);
  return a.kind === "ban" ? out.ban(t.chat, t.user) : out.kick(t.chat, t.user);
}

/**
 * The deletes, at once: the message (and a flood's burst or a raid's copies),
 * and on a ban the member's messages from the last 10 minutes, batched by
 * CommunityOut. Too old to delete (an edit of an old message): an offender is
 * muted instead, and the alert asks an admin to delete it.
 */
function removeNow(d: Decision, t: ModTarget, deps: ModDeps): Removed {
  const now = deps.now();
  let actions: readonly ModAction[] = d.actions;
  const wantsDelete = actions.some((a) => a.kind === "delete");
  const byHand = wantsDelete && t.ageSeconds > DELETE_LIMIT_S;
  if (byHand) {
    actions = actions.filter((a) => a.kind !== "delete" && a.kind !== "warn");
    if (t.user !== null && d.offence !== "none" && !actions.some(isSanction)) actions = [...actions, { kind: "mute", seconds: DAY_S }];
  }
  const remove = new Set<number>(byHand || !wantsDelete ? [] : t.messageIds.filter(validId));
  if (t.user !== null && actions.some((a) => a.kind === "ban")) for (const id of deps.recentIds(t.chat, t.user, now)) if (validId(id)) remove.add(id);
  if (remove.size > 0) {
    deps.out.remove(t.chat, [...remove]);
    deps.records.count(t.chat, "removed", now, remove.size);
  }
  return { actions, byHand, removed: remove.size > 0 && wantsDelete && !byHand };
}

/**
 * The rest, in its member's queue: the restriction, ban or removal, the
 * offence (never for someone banned, removed or gone since), the notice and
 * the alert, each telling only what really took.
 */
async function sanctionAndTell(d: Decision & { aiGuess?: string | null }, t: ModTarget, deps: ModDeps, first: Removed): Promise<void> {
  const { records } = deps;
  const did: ModAction[] = first.removed ? [DEL] : [];
  for (const a of first.actions) {
    if (a.kind === "delete" || !(await sanction(a, t, deps))) continue;
    did.push(a);
    records.count(t.chat, COUNTER[a.kind], deps.now());
  }
  const now = deps.now();
  const gone = did.some((a) => a.kind === "ban" || a.kind === "kick");
  if (d.offence !== "none" && t.user !== null && !gone && !leftSince(records, t.chat, t.user, t.seenAt ?? now, now)) {
    records.addOffence(t.chat, t.user, now, d.category, d.offence === "certain");
  }

  const template = noticeOf(d, did);
  if (template) {
    const w = deps.words(t.lang);
    const mute = did.find((a): a is Extract<ModAction, { kind: "mute" }> => a.kind === "mute");
    const values = { reason: esc(w.mod.reasons[d.category]), duration: mute ? esc(durationText(mute.seconds, w, t.lang)) : undefined };
    const kept = !did.some((a) => a.kind === "delete") ? t.messageIds.find(validId) : undefined;
    postNotice(template, t, deps, values, first.byHand ? undefined : kept);
  }
  // A message left for an admin to delete always reaches them, even when its decision alone wouldn't.
  const kind = d.alert ?? (first.byHand ? "action" : null);
  if (kind !== null) {
    deps.alerts.alert(alertOf(kind, d, t, did, first.byHand, deps));
    if (ESCALATED.has(kind)) records.count(t.chat, "escalated", now);
  }
}

/** Each CommunityOut's queued moderation calls, one line per member (or channel identity) per chat. */
const queues = new WeakMap<CommunityOut, Map<string, Promise<void>>>();
const lineOf = (t: ModTarget): string => `${t.chat}:${t.user !== null ? t.user : t.senderChat !== null ? `c${t.senderChat}` : "-"}`;

/**
 * Carries out a decision. The deletes go out at once (and, on a ban, the
 * member's messages from the last 10 minutes), so a scam never waits behind
 * someone else's mute; then the restriction, ban or removal, the offence,
 * the notice and the alert run in order per member, so one slow or
 * rate-limited call holds up only its own member. The returned promise
 * settles when this one is done and never rejects, and the update handler
 * doesn't wait for it. A notice or alert says only what really took.
 */
export function applyDecision(decision: Decision & { aiGuess?: string | null }, target: ModTarget, deps: ModDeps): Promise<void> {
  let first: Removed;
  try {
    first = removeNow(decision, target, deps);
  } catch (error: unknown) {
    deps.log?.(`moderation's delete failed: ${error instanceof Error ? error.name : "error"}`);
    first = { actions: decision.actions.filter((a) => a.kind !== "delete"), byHand: false, removed: false };
  }
  const lines = queues.get(deps.out) ?? new Map<string, Promise<void>>();
  queues.set(deps.out, lines);
  const line = lineOf(target);
  const run = (lines.get(line) ?? Promise.resolve())
    .then(() => sanctionAndTell(decision, target, deps, first))
    .catch((error: unknown) => deps.log?.(`moderation failed: ${error instanceof Error ? error.name : "error"}`));
  lines.set(line, run);
  void run.then(() => {
    if (lines.get(line) === run) lines.delete(line);
  });
  return run;
}
