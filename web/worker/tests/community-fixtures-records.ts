import {
  type AiOff,
  type ChatId,
  type ChatSettings,
  COUNTER_KEYS,
  type CounterKey,
  type OffenceRecord,
  type PendingCheck,
  type Records,
  type SpendRecord,
  type UserId,
} from "../src/telegram/community/types";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const empty = (): OffenceRecord => ({ n: 0, certain: 0, last: 0, category: null });

/** One value per member of a group. */
class PerMember<T> {
  private readonly chats = new Map<ChatId, Map<UserId, T>>();
  get(chat: ChatId, user: UserId): T | undefined {
    return this.chats.get(chat)?.get(user);
  }
  set(chat: ChatId, user: UserId, value: T): void {
    const members = this.chats.get(chat) ?? new Map<UserId, T>();
    members.set(user, value);
    this.chats.set(chat, members);
  }
  delete(chat: ChatId, user: UserId): void {
    this.chats.get(chat)?.delete(user);
  }
  users(chat: ChatId): UserId[] {
    return [...(this.chats.get(chat)?.keys() ?? [])];
  }
  all(): Array<[ChatId, UserId, T]> {
    return [...this.chats].flatMap(([chat, members]) => [...members].map(([user, value]): [ChatId, UserId, T] => [chat, user, value]));
  }
}

/**
 * Records kept in memory with the retention community/records.ts keeps:
 * offences count until 7 days after the last, newcomers until their end,
 * checks until 5 minutes past the deadline, when the newcomer's restriction
 * ends (one goes once deadline + 5 minutes <= now), reviews for a day,
 * deletes at most 48 hours past due, counters for today and yesterday
 * (UTC). A group starts observe, unprompted answers on, unless `defaults`
 * says otherwise. Every read returns a copy.
 */
export function memoryRecords(defaults: Partial<ChatSettings> = {}): Records {
  const settings = new Map<ChatId, ChatSettings>();
  const trusted = new PerMember<{ since: number; name: string }>();
  const newcomers = new PerMember<{ passedAt: number; until: number }>();
  const offences = new PerMember<OffenceRecord>();
  const pending = new PerMember<PendingCheck>();
  const appeals = new PerMember<number>();
  const deletes = new Map<string, { chat: ChatId; messageId: number; due: number }>();
  const counters = new Map<string, Record<CounterKey, number>>();
  let spend: SpendRecord | null = null;
  let off: AiOff | null = null;
  const start = (): ChatSettings => ({ paused: false, proactive: true, strictness: "observe", raidUntil: 0, ...defaults });
  const live = (chat: ChatId, user: UserId, now: number): OffenceRecord => {
    const record = offences.get(chat, user);
    return record && now - record.last < 7 * DAY ? { ...record } : empty();
  };
  const zero = () => Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0])) as Record<CounterKey, number>;

  return {
    settings: (chat) => ({ ...(settings.get(chat) ?? start()) }),
    updateSettings: (chat, patch) => void settings.set(chat, { ...(settings.get(chat) ?? start()), ...patch }),
    isTrusted: (chat, user) => trusted.get(chat, user) !== undefined,
    trustedName: (chat, user, nameHash) => trusted.get(chat, user)?.name === nameHash,
    trust: (chat, user, nameHash, now) => trusted.set(chat, user, { since: now, name: nameHash }),
    untrust: (chat, user) => trusted.delete(chat, user),
    trusted: (chat) => trusted.users(chat),
    isNewcomer: (chat, user, now) => (newcomers.get(chat, user)?.until ?? 0) > now,
    newcomerSince: (chat, user, now) => {
      const n = newcomers.get(chat, user);
      return n && n.until > now ? n.passedAt : null;
    },
    markNewcomer: (chat, user, passedAt, until) => newcomers.set(chat, user, { passedAt, until }),
    offences: live,
    addOffence(chat, user, now, category, certain) {
      const before = live(chat, user, now);
      const after = { n: before.n + 1, certain: before.certain + (certain ? 1 : 0), last: now, category };
      offences.set(chat, user, after);
      return { ...after };
    },
    removeOffence(chat, user) {
      const before = offences.get(chat, user);
      if (!before || before.n <= 1) {
        offences.delete(chat, user);
        return empty();
      }
      // As records.ts: which offence was rule-certain isn't kept, so the undone one counts as certain.
      const after = { ...before, n: before.n - 1, certain: Math.max(0, before.certain - 1) };
      offences.set(chat, user, after);
      return { ...after };
    },
    pending: (chat, user) => {
      const check = pending.get(chat, user);
      return check ? { ...check } : null;
    },
    setPending: (check) => pending.set(check.chat, check.user, { ...check }),
    dropPending: (chat, user) => pending.delete(chat, user),
    pendingOn: (chat, messageId) => pending.all().filter(([c, , p]) => c === chat && p.messageId === messageId).map(([, , p]) => ({ ...p })),
    pendingIn: (chat) => pending.all().filter(([c]) => c === chat).map(([, , p]) => ({ ...p })),
    duePending: (now) => pending.all().filter(([, , p]) => p.deadline <= now).map(([, , p]) => ({ ...p })),
    appealAt: (chat, user) => appeals.get(chat, user) ?? null,
    markAppeal: (chat, user, now) => appeals.set(chat, user, now),
    scheduleDelete: (chat, messageId, due) => void deletes.set(`${chat}:${messageId}`, { chat, messageId, due }),
    dueDeletes: (now) => [...deletes.values()].filter((d) => d.due <= now).map(({ chat, messageId }) => ({ chat, messageId })),
    doneDelete: (chat, messageId) => void deletes.delete(`${chat}:${messageId}`),
    forgetMember(chat, user) {
      for (const records of [trusted, newcomers, offences, pending, appeals]) records.delete(chat, user);
    },
    forgetChatsExcept(allowed) {
      const keep = new Set(allowed);
      for (const records of [trusted, newcomers, offences, pending, appeals]) {
        for (const [chat, user] of records.all()) if (!keep.has(chat)) records.delete(chat, user);
      }
    },
    forgetChat(gone) {
      for (const records of [trusted, newcomers, offences, pending, appeals]) {
        for (const [chat, user] of records.all()) if (chat === gone) records.delete(chat, user);
      }
    },
    count(chat, key, now, n = 1) {
      const id = `${chat}:${utcDay(now)}`;
      const today = counters.get(id) ?? zero();
      today[key] += n;
      counters.set(id, today);
    },
    counts: (chat, now) => ({ ...(counters.get(`${chat}:${utcDay(now)}`) ?? zero()) }),
    spend: () => (spend ? { ...spend, lanes: { ...spend.lanes } } : null),
    setSpend: (s) => {
      spend = { ...s, lanes: { ...s.lanes } };
    },
    aiOff: () => (off ? { ...off } : null),
    setAiOff: (v) => {
      off = v ? { ...v } : null;
    },
    prune(now) {
      for (const [chat, user, o] of offences.all()) if (now - o.last >= 7 * DAY) offences.delete(chat, user);
      for (const [chat, user, n] of newcomers.all()) if (n.until <= now) newcomers.delete(chat, user);
      // As records.ts (RETENTION.checkGrace): kept until 5 minutes after the deadline, so the tick can still remove whoever ran out.
      for (const [chat, user, p] of pending.all()) if (p.deadline + 5 * MINUTE <= now) pending.delete(chat, user);
      for (const [chat, user, at] of appeals.all()) if (now - at >= DAY) appeals.delete(chat, user);
      for (const [id, d] of deletes) if (now - d.due > 2 * DAY) deletes.delete(id);
      const keep = new Set([utcDay(now), utcDay(now - DAY)]);
      for (const id of counters.keys()) if (!keep.has(id.slice(id.lastIndexOf(":") + 1))) counters.delete(id);
    },
  };
}
