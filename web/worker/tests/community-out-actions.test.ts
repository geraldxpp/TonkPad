import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramError } from "../src/telegram/api";
import { LIFTED, MUTED, TEXT_ONLY } from "../src/telegram/community/permissions";
import { ADMIN_CHAT_ID, GROUP_ID } from "./community-fixtures";
import { outBench } from "./community-out-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

const NOW_S = Math.floor(NOW / 1_000);
const DAY_S = 86_400;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createTelegramOut: moderation calls", () => {
  it("removes with one unbanChatMember without only_if_banned, lifts a ban only with it, and bans without an end", async () => {
    const { out, calls } = outBench();
    expect(await out.kick(GROUP_ID, 101)).toBe(true);
    expect(await out.unban(GROUP_ID, 101)).toBe(true);
    expect(await out.ban(GROUP_ID, 101)).toBe(true);
    expect(await out.banSenderChat(GROUP_ID, -1_005_550_000_000)).toBe(true);
    expect(calls.map(({ method, params }) => ({ method, params }))).toEqual([
      { method: "unbanChatMember", params: { chat_id: GROUP_ID, user_id: 101 } },
      { method: "unbanChatMember", params: { chat_id: GROUP_ID, user_id: 101, only_if_banned: true } },
      { method: "banChatMember", params: { chat_id: GROUP_ID, user_id: 101 } },
      { method: "banChatSenderChat", params: { chat_id: GROUP_ID, sender_chat_id: -1_005_550_000_000 } },
    ]);
  });

  it("reports a refusal as false, never a throw, and sends nothing for an ID that can't be one", async () => {
    const { out, calls } = outBench({ refuse: () => new TelegramError(400, "Bad Request: user is an administrator of the chat", null) });
    expect(await out.ban(GROUP_ID, 101)).toBe(false);
    expect(await out.restrict(GROUP_ID, 101, MUTED, NOW_S + 3_600)).toBe(false);
    const before = calls.length;
    expect(await out.kick(GROUP_ID, 0)).toBe(false);
    expect(await out.restrict(0, 101, MUTED, NOW_S + 3_600)).toBe(false);
    expect(await out.restrict(GROUP_ID, 101, MUTED, Number.NaN)).toBe(false);
    expect(calls).toHaveLength(before);
  });

  it("sends an end at least 31 seconds and at most a year ahead, so Telegram never reads it as forever", async () => {
    const { out, of, lines } = outBench();
    await out.restrict(GROUP_ID, 101, MUTED, NOW_S + 3_600);
    await out.restrict(GROUP_ID, 101, MUTED, NOW_S + 10);
    await out.restrict(GROUP_ID, 101, TEXT_ONLY, NOW_S - 60);
    await out.restrict(GROUP_ID, 101, MUTED, NOW_S + 400 * DAY_S);
    expect(await out.restrict(GROUP_ID, 101, LIFTED, 0)).toBe(true);
    // A restriction without an end would last forever: only a lift may go without one.
    expect(await out.restrict(GROUP_ID, 101, MUTED, 0)).toBe(false);
    const sent = of("restrictChatMember").map((c) => c.params);
    expect(sent.map((p) => p.until_date)).toEqual([NOW_S + 3_600, NOW_S + 31, NOW_S + 31, NOW_S + 365 * DAY_S, undefined]);
    expect(sent[0]).toEqual({ chat_id: GROUP_ID, user_id: 101, permissions: MUTED, use_independent_chat_permissions: true, until_date: NOW_S + 3_600 });
    expect(sent[4]).toEqual({ chat_id: GROUP_ID, user_id: 101, permissions: LIFTED, use_independent_chat_permissions: true });
    expect(lines).toEqual(["a restriction without an end was refused"]);
  });

  it("works the end out again when a call is retried after Telegram's wait", async () => {
    let refused = 0;
    const tooMany = () => new TelegramError(429, "Too Many Requests: retry after 40", 40);
    const { out, of } = outBench({ refuse: (method) => (method === "restrictChatMember" && refused++ === 0 ? tooMany() : null) });
    const done = out.restrict(GROUP_ID, 101, MUTED, NOW_S + 45);
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(await done).toBe(true);
    // Sent as it was asked for, 45 s ahead; then 40 s later, when 45 s ahead would be 5 s: 31 s ahead of the retry.
    expect(of("restrictChatMember").map((c) => c.params.until_date)).toEqual([NOW_S + 45, NOW_S + 40 + 31]);
  });
});

describe("createTelegramOut: what it reads", () => {
  it("keeps members, chats and counts 10 minutes, reads admins every time, and forgets a member after an action", async () => {
    const { out, of } = outBench();
    await out.member(GROUP_ID, 101);
    await out.member(GROUP_ID, 101);
    await Promise.all([out.member(GROUP_ID, 102), out.member(GROUP_ID, 102)]);
    await out.chat(GROUP_ID);
    await out.chat(GROUP_ID);
    await out.memberCount(ADMIN_CHAT_ID);
    expect(await out.memberCount(ADMIN_CHAT_ID)).toBe(42);
    expect(of("getChatMember")).toHaveLength(2);
    expect(of("getChat")).toHaveLength(1);
    expect(of("getChatMemberCount")).toHaveLength(1);
    expect(await out.admins(GROUP_ID)).toEqual([{ status: "creator", user: { id: 7_001, first_name: "Owner" } }]);
    await out.admins(GROUP_ID);
    expect(of("getChatAdministrators")).toHaveLength(2);

    const acts = [() => out.restrict(GROUP_ID, 101, MUTED, NOW_S + 600), () => out.ban(GROUP_ID, 101), () => out.unban(GROUP_ID, 101), () => out.kick(GROUP_ID, 101)];
    for (const act of acts) {
      await act();
      await out.member(GROUP_ID, 101);
    }
    expect(of("getChatMember").filter((c) => c.params.user_id === 101)).toHaveLength(5);

    await vi.advanceTimersByTimeAsync(10 * MIN);
    await out.member(GROUP_ID, 102);
    await out.chat(GROUP_ID);
    await out.memberCount(ADMIN_CHAT_ID);
    expect(of("getChatMember").filter((c) => c.params.user_id === 102)).toHaveLength(2);
    expect(of("getChat")).toHaveLength(2);
    expect(of("getChatMemberCount")).toHaveLength(2);
  });

  it("reads an admin's place every time, so the bot's own rights show a change at once", async () => {
    const BOT = 9_000;
    const { out, of } = outBench({ answer: (method, p) => (method === "getChatMember" && p.user_id === BOT ? { status: "administrator", user: { id: BOT }, can_delete_messages: true } : undefined) });
    expect(await out.member(GROUP_ID, BOT)).toMatchObject({ status: "administrator", can_delete_messages: true });
    await out.member(GROUP_ID, BOT);
    await out.member(GROUP_ID, 101);
    await out.member(GROUP_ID, 101);
    expect(of("getChatMember").map((c) => c.params.user_id)).toEqual([BOT, BOT, 101]);
  });

  it("keeps no failed read, and nothing a read brought back while an action changed the member", async () => {
    let failures = 1;
    const { out, of } = outBench({ refuse: (method) => (method === "getChat" && failures-- > 0 ? new TelegramError(400, "Bad Request: chat not found", null) : null) });
    expect(await out.chat(GROUP_ID)).toBeNull();
    expect(await out.chat(GROUP_ID)).toMatchObject({ id: GROUP_ID });
    expect(of("getChat")).toHaveLength(2);
    await Promise.all([out.member(GROUP_ID, 101), out.ban(GROUP_ID, 101)]);
    await out.member(GROUP_ID, 101);
    expect(of("getChatMember")).toHaveLength(2);
  });
});

describe("createTelegramOut: deletes", () => {
  it("sends the deletes asked for within 300 ms as one deleteMessages per chat, at most 100 IDs each", async () => {
    const { out, of } = outBench();
    out.remove(GROUP_ID, [11, 12]);
    await vi.advanceTimersByTimeAsync(100);
    out.remove(GROUP_ID, [12, 13, 0, -4]);
    out.remove(ADMIN_CHAT_ID, [5]);
    expect(of("deleteMessages")).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(of("deleteMessages").map((c) => c.params)).toEqual([{ chat_id: GROUP_ID, message_ids: [11, 12, 13] }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(of("deleteMessages").map((c) => c.params)).toEqual([{ chat_id: GROUP_ID, message_ids: [11, 12, 13] }, { chat_id: ADMIN_CHAT_ID, message_ids: [5] }]);
    out.remove(GROUP_ID, Array.from({ length: 150 }, (_, i) => 1_000 + i));
    await vi.advanceTimersByTimeAsync(300);
    expect(of("deleteMessages").slice(2).map((c) => (c.params.message_ids as number[]).length)).toEqual([100, 50]);
  });

  it("deletes a message less than a minute away on a timer, and keeps every later delete in the records through a restart", async () => {
    const first = outBench();
    first.out.removeLater(GROUP_ID, 40, 30 * SEC);
    first.out.removeLater(GROUP_ID, 41, 5 * MIN);
    // Both are written down at once, so a crash before they fall due still makes them.
    expect(first.records.dueDeletes(NOW + 5 * MIN)).toEqual([{ chat: GROUP_ID, messageId: 40 }, { chat: GROUP_ID, messageId: 41 }]);
    await vi.advanceTimersByTimeAsync(30 * SEC + 300);
    expect(first.of("deleteMessages").map((c) => c.params)).toEqual([{ chat_id: GROUP_ID, message_ids: [40] }]);
    // Confirmed by Telegram: gone from the records.
    expect(first.records.dueDeletes(NOW + 5 * MIN)).toEqual([{ chat: GROUP_ID, messageId: 41 }]);

    // A short delay still waiting when the worker stops is written down too.
    first.out.removeLater(GROUP_ID, 42, 30 * SEC);
    first.out.stop();
    const second = outBench({ records: first.records });
    await vi.advanceTimersByTimeAsync(5 * MIN);
    await second.out.tick(Date.now());
    await vi.advanceTimersByTimeAsync(300);
    expect(first.of("deleteMessages")).toHaveLength(1);
    expect(second.of("deleteMessages").map((c) => c.params)).toEqual([{ chat_id: GROUP_ID, message_ids: [41, 42] }]);
    expect(second.records.dueDeletes(Date.now())).toEqual([]);
  });
});

describe("createTelegramOut: the admin chat", () => {
  it("tells the owner through the log, at most hourly, when the admin chat became a supergroup with a new ID", async () => {
    const upgraded = new TelegramError(400, "Bad Request: group chat was upgraded to a supergroup chat", null);
    const { out, lines } = outBench({ refuse: (_m, p) => (p.chat_id === ADMIN_CHAT_ID ? upgraded : null) });
    expect(await out.send(ADMIN_CHAT_ID, "An alert", { kind: "alert" })).toBeNull();
    await vi.advanceTimersByTimeAsync(3 * SEC);
    expect(await out.send(ADMIN_CHAT_ID, "Another", { kind: "alert" })).toBeNull();
    expect(lines.filter((line) => line.includes("TELEGRAM_ADMIN_CHAT_ID"))).toHaveLength(1);
    expect(await out.send(GROUP_ID, "A notice", { kind: "notice" })).not.toBeNull();
  });
});
