import { createHash } from "node:crypto";
import { dropChat, dropChatsExcept, dropMember, getMember, pruneState, putMember, RETENTION } from "./records-retention";
import type { CommunityStateFile } from "./state";
import {
  isFingerprint, isId, isTime, pendingKey, readDelete, readNewcomer, readOff, readOffence, readPending, readSettings, readSpend, readTrusted, utcDay,
} from "./state-check";
import { type ChatId, type ChatSettings, COUNTER_KEYS, type CounterKey, type OffenceRecord, type Records, type UserId } from "./types";

export interface RecordsOptions {
  /** Called after every change; the caller debounces the save. Never called before createRecords returns. */
  persist: () => void;
  /** A group's settings until an owner (or raid mode) changes them. */
  defaults: (chat: ChatId) => ChatSettings;
  /** The clock for what no call says: the prune at load and when a delete was scheduled. Date.now unless given. */
  now?: () => number;
}

const none = (): OffenceRecord => ({ n: 0, certain: 0, last: 0, category: null });

/** A name fingerprint as stored: 16 lower-case hex; anything else is hashed into one, so no name ever reaches the file. */
function fingerprint(nameHash: string): string {
  const lower = nameHash.toLowerCase();
  return isFingerprint(lower) ? lower : createHash("sha256").update(nameHash).digest("hex").slice(0, 16);
}

/**
 * The community's records over the state file: every change goes into
 * `state` itself (so saving it saves them) and is followed by persist().
 * Retention, as the privacy page states, is enforced by prune(now), which
 * runs here at once (the load) and which the caller runs every minute:
 * offences until 7 days after the last; newcomers until their first days
 * end (7 days at most); checks until 5 minutes after their deadline, so one
 * that ran out while the worker was down is still there for the first tick
 * (15 minutes at most); trusted members until untrust(), forgetMember()
 * (the caller's weekly getChatMember sweep), forgetChatsExcept() (a group
 * no longer run) or forgetChat() (a group the bot is no longer in); reviews
 * for a day; the bot's
 * messages to delete until done, never past 48 hours from when they were
 * scheduled; counters for today and yesterday (UTC); the spend for its
 * day. What the load dropped is saved by the first prune() or change. Only
 * what would survive a reload is kept, and every read returns a copy.
 */
export function createRecords(state: CommunityStateFile, options: RecordsOptions): Records {
  const { persist, defaults } = options;
  const clock = options.now ?? Date.now;
  let unsaved = pruneState(state, clock());
  const save = (changed = true) => {
    if (!changed) return;
    unsaved = false;
    persist();
  };
  const settings = (chat: ChatId): ChatSettings => ({ ...(state.chats[String(chat)] ?? defaults(chat)) });
  const offences = (chat: ChatId, user: UserId, now: number): OffenceRecord => {
    const record = getMember(state.warnings, chat, user);
    return record && now - record.last < RETENTION.offences ? { ...record } : none();
  };

  return {
    settings,
    updateSettings(chat, patch) {
      const current = settings(chat);
      const next = readSettings({
        paused: patch.paused ?? current.paused,
        proactive: patch.proactive ?? current.proactive,
        strictness: patch.strictness ?? current.strictness,
        raidUntil: patch.raidUntil ?? current.raidUntil,
      });
      if (!next || !isId(chat)) return;
      state.chats[String(chat)] = next;
      save();
    },

    isTrusted: (chat, user) => getMember(state.trusted, chat, user) !== undefined,
    trustedName: (chat, user, nameHash) => getMember(state.trusted, chat, user)?.name === fingerprint(nameHash),
    trust(chat, user, nameHash, now) {
      const record = readTrusted({ since: now, name: fingerprint(nameHash) });
      save(record !== null && putMember(state.trusted, chat, user, record));
    },
    untrust: (chat, user) => save(dropMember(state.trusted, chat, user)),
    trusted: (chat) =>
      Object.entries(state.trusted[String(chat)] ?? {})
        .sort(([a, x], [b, y]) => x.since - y.since || Number(a) - Number(b))
        .map(([user]) => Number(user)),

    isNewcomer: (chat, user, now) => (getMember(state.newcomers, chat, user)?.until ?? 0) > now,
    newcomerSince: (chat, user, now) => {
      const n = getMember(state.newcomers, chat, user);
      return n && n.until > now ? n.passedAt : null;
    },
    markNewcomer(chat, user, passedAt, until) {
      const record = readNewcomer({ passedAt, until });
      save(record !== null && putMember(state.newcomers, chat, user, record));
    },

    offences,
    addOffence(chat, user, now, category, certain) {
      const before = offences(chat, user, now);
      const counted: OffenceRecord = { n: before.n + 1, certain: before.certain + (certain ? 1 : 0), last: now, category };
      const after = readOffence(counted);
      save(after !== null && putMember(state.warnings, chat, user, after));
      return { ...(after ?? counted) };
    },
    removeOffence(chat, user) {
      const before = getMember(state.warnings, chat, user);
      if (!before || before.n <= 1) {
        save(dropMember(state.warnings, chat, user));
        return none();
      }
      // Which offence was rule-certain isn't kept: the undone one counts as certain, so an offence an admin undid never leads to a ban.
      const after: OffenceRecord = { ...before, n: before.n - 1, certain: Math.max(0, before.certain - 1) };
      save(putMember(state.warnings, chat, user, after));
      return { ...after };
    },

    pending: (chat, user) => {
      const check = state.pending[pendingKey(chat, user)];
      return check ? { ...check } : null;
    },
    setPending(check) {
      const clean = readPending(check);
      if (!clean) return;
      state.pending[pendingKey(clean.chat, clean.user)] = clean;
      save();
    },
    dropPending(chat, user) {
      const key = pendingKey(chat, user);
      if (state.pending[key] === undefined) return;
      delete state.pending[key];
      save();
    },
    pendingOn: (chat, messageId) => Object.values(state.pending).filter((p) => p.chat === chat && p.messageId === messageId).map((p) => ({ ...p })),
    pendingIn: (chat) => Object.values(state.pending).filter((p) => p.chat === chat).map((p) => ({ ...p })),
    duePending: (now) => Object.values(state.pending).filter((p) => p.deadline <= now).map((p) => ({ ...p })),

    appealAt: (chat, user) => getMember(state.appeals, chat, user) ?? null,
    markAppeal: (chat, user, now) => save(isTime(now) && putMember(state.appeals, chat, user, now)),

    scheduleDelete(chat, messageId, due) {
      const entry = readDelete({ chat, messageId, due, added: clock() });
      if (!entry) return;
      // Scheduled again: the new due time, the first `added` (the message's age is what Telegram's 48 hours count).
      const known = state.deletes.find((d) => d.chat === chat && d.messageId === messageId);
      if (known) known.due = entry.due;
      else state.deletes.push(entry);
      save();
    },
    dueDeletes: (now) =>
      state.deletes.filter((d) => d.due <= now && now - d.added < RETENTION.deletes).map(({ chat, messageId }) => ({ chat, messageId })),
    doneDelete(chat, messageId) {
      const kept = state.deletes.filter((d) => d.chat !== chat || d.messageId !== messageId);
      if (kept.length === state.deletes.length) return;
      state.deletes = kept;
      save();
    },

    forgetMember(chat, user) {
      const check = pendingKey(chat, user);
      const hadCheck = state.pending[check] !== undefined;
      delete state.pending[check];
      const dropped = [state.warnings, state.newcomers, state.trusted, state.appeals].map((map) => dropMember<unknown>(map, chat, user));
      save(hadCheck || dropped.includes(true));
    },
    forgetChatsExcept: (allowed) => save(dropChatsExcept(state, allowed)),
    forgetChat: (chat) => save(dropChat(state, chat)),

    count(chat, key, now, n = 1) {
      const day = utcDay(now);
      if (!day || !isId(chat) || !COUNTER_KEYS.includes(key) || !Number.isSafeInteger(n) || n <= 0) return;
      const days = state.counters[String(chat)] ?? (state.counters[String(chat)] = {});
      const today = days[day] ?? (days[day] = {});
      today[key] = (today[key] ?? 0) + n;
      save();
    },
    counts(chat, now) {
      const day = utcDay(now);
      const today = (day ? state.counters[String(chat)]?.[day] : undefined) ?? {};
      return Object.fromEntries(COUNTER_KEYS.map((key) => [key, today[key] ?? 0])) as Record<CounterKey, number>;
    },

    spend: () => (state.spend ? { day: state.spend.day, lanes: { ...state.spend.lanes } } : null),
    setSpend(s) {
      const clean = readSpend(s);
      if (!clean) return;
      state.spend = clean;
      save();
    },
    aiOff: () => (state.off ? { ...state.off } : null),
    setAiOff(v) {
      const clean = v === null ? null : readOff(v);
      if (v !== null && !clean) return;
      state.off = clean;
      save();
    },

    prune(now) {
      const dropped = pruneState(state, now);
      save(dropped || unsaved);
    },
  };
}
