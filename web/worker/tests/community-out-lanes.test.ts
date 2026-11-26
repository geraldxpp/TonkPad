import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import { GROUP_ID } from "./community-fixtures";
import { outBench } from "./community-out-fixtures";
import { NOW } from "./fixtures";

const SECOND = 1_000;
const NOW_S = Math.floor(NOW / SECOND);
/** Telegram's answer for a member: restricted until `until` (unix seconds), as the getChatMember calls so far would see it. */
const restricted = (user: number, until: number) => ({ status: "restricted", is_member: true, can_send_messages: false, until_date: until, user: { id: user, first_name: "Member" } });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createTelegramOut: a join's fresh read", () => {
  it("asks Telegram again, though an answer is kept, and keeps the new one for other readers", async () => {
    let until = NOW_S + 86_400;
    const { out, of } = outBench({ answer: (method, p) => (method === "getChatMember" ? restricted(Number(p.user_id), until) : undefined) });
    expect(await out.member(GROUP_ID, 101)).toMatchObject({ until_date: NOW_S + 86_400 });
    until = NOW_S + 600;
    // The cached answer would hide the change; a join's read never uses it.
    expect(await out.member(GROUP_ID, 101)).toMatchObject({ until_date: NOW_S + 86_400 });
    expect(await out.member(GROUP_ID, 101, { fresh: true })).toMatchObject({ until_date: NOW_S + 600 });
    expect(await out.member(GROUP_ID, 101)).toMatchObject({ until_date: NOW_S + 600 });
    expect(of("getChatMember")).toHaveLength(2);
  });

  it("forgets a kept answer when told the member changed, so the next read asks Telegram", async () => {
    const { out, of } = outBench();
    await out.member(GROUP_ID, 101);
    await out.member(GROUP_ID, 101);
    out.forget(GROUP_ID, 101);
    out.forget(GROUP_ID, 102);
    await out.member(GROUP_ID, 101);
    expect(of("getChatMember")).toHaveLength(2);
  });

  it("waits after moderation and messages, never before them, and gives up after 5 seconds when the second's 25 stay taken", async () => {
    const { out, of } = outBench();
    // 60 restrictions, 1 fresh read and 1 send asked for in the same moment: Telegram's 25 a second go to the restrictions first, then the send.
    const restricts = Array.from({ length: 60 }, (_, i) => out.restrict(GROUP_ID, 1_000 + i, MUTED, NOW_S + 600));
    const read = out.member(GROUP_ID, 101, { fresh: true });
    const sent = out.send(GROUP_ID, "check", { kind: "check" });
    await vi.advanceTimersByTimeAsync(3 * SECOND);
    await Promise.all([...restricts, sent]);
    expect(await read).not.toBeNull();
    const order = of("restrictChatMember").concat(of("sendMessage"), of("getChatMember")).sort((a, b) => a.at - b.at);
    const methods = order.map((c) => c.method);
    expect(methods.indexOf("getChatMember")).toBeGreaterThan(methods.lastIndexOf("restrictChatMember"));
    expect(methods.indexOf("getChatMember")).toBeGreaterThan(methods.indexOf("sendMessage"));

    // 200 restrictions keep every slot busy for 8 seconds: the read is dropped unsent after its 5.
    const busy = Array.from({ length: 200 }, (_, i) => out.restrict(GROUP_ID, 2_000 + i, MUTED, NOW_S + 600));
    const late = out.member(GROUP_ID, 102, { fresh: true });
    await vi.advanceTimersByTimeAsync(9 * SECOND);
    await Promise.all(busy);
    expect(await late).toBeNull();
    expect(of("getChatMember").filter((c) => c.params.user_id === 102)).toEqual([]);
  });
});

describe("createTelegramOut: press answers in a press flood", () => {
  it("never makes a restriction or a removal wait behind press answers, and drops an answer it can't send within 5 seconds", async () => {
    const { out, of } = outBench();
    const answers = Array.from({ length: 200 }, (_, i) => out.answerPress(`q${i}`));
    const restrict = out.restrict(GROUP_ID, 101, MUTED, NOW_S + 600);
    const kick = out.kick(GROUP_ID, 102);
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(await restrict).toBe(true);
    expect(await kick).toBe(true);
    // The first second's 25 went to answers already asked for; the moderation calls took the next slots, ahead of the 175 still waiting.
    const restricted = of("restrictChatMember")[0].at;
    const removed = of("unbanChatMember")[0].at;
    expect(Math.max(restricted, removed) - NOW).toBeLessThanOrEqual(SECOND);
    expect(of("answerCallbackQuery").filter((c) => c.at > NOW + SECOND).length).toBeGreaterThan(0);
    // 25 a second for 5 seconds, two of them moderation: the rest were never sent.
    const sent = (await Promise.all(answers)).filter(Boolean).length;
    expect(sent).toBeLessThanOrEqual(5 * 25 + 25);
    expect(sent).toBeLessThan(200);
    expect(of("answerCallbackQuery").every((c) => c.at - NOW <= 5 * SECOND)).toBe(true);
  });
});

describe("createTelegramOut: a check's send and its edits", () => {
  it("lets a check's send waiting for the group's minute go ahead of edits, which are skipped while the minute is past their share", async () => {
    const { out, of } = outBench();
    // 14 notices fill the edits' share of the minute; 6 checks fill the rest.
    for (let n = 1; n <= 14; n += 1) {
      expect(await out.send(GROUP_ID, `notice ${n}`, { kind: "notice" })).not.toBeNull();
      await vi.advanceTimersByTimeAsync(3 * SECOND);
    }
    expect(await out.edit(GROUP_ID, 701, "<b>edited</b>")).toBe(false);
    const checks = Array.from({ length: 7 }, (_, n) => out.send(GROUP_ID, `check ${n + 1}`, { kind: "check" }));
    // An edit asked for while the 7th check waits for a slot is skipped, never queued ahead of it.
    expect(await out.edit(GROUP_ID, 701, "<b>edited again</b>")).toBe(false);
    await vi.advanceTimersByTimeAsync(20 * SECOND);
    expect((await Promise.all(checks)).every((id) => id !== null)).toBe(true);
    expect(of("editMessageText")).toEqual([]);
  });
});
