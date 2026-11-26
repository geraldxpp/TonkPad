import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTED, TEXT_ONLY } from "../src/telegram/community/permissions";
import type { TgChatMember } from "../src/telegram/types";
import { callsOf, GROUP, GROUP_ID } from "./community-fixtures";
import { NOW } from "./fixtures";
import { burstBench } from "./mod-newcomers-bench";
import { DAY, MINUTE, person, press, SECOND, setup, unix } from "./mod-newcomers-setup";

/** Someone restricted with no sending until `untilMs` (0: never), as Telegram shows them in the group. */
const mutedUntil = (user: number, untilMs: number): TgChatMember => ({ status: "restricted", is_member: true, can_send_messages: false, until_date: untilMs === 0 ? 0 : unix(untilMs), user: person(user) });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a join whose joined message comes before its chat_member update", () => {
  it("restricts at once and checks them as usual when the update, within the second, shows nothing held, with no read", async () => {
    const { out, records, newcomers, joinFirst } = setup();
    void joinFirst([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(200);
    expect(callsOf(out.log, "restrict")).toEqual([[GROUP_ID, 201, MUTED, unix(NOW + 10 * MINUTE)]]);
    newcomers.noteHeld(GROUP_ID, 201, { status: "member", user: person(201) }, NOW + 200);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "send")).toHaveLength(1);
    expect(records.pending(GROUP_ID, 201)).toMatchObject({ messageId: 5001 });
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(callsOf(out.log, "member")).toEqual([]);
  });

  it("puts back a restriction an update shows after the second, while they are on the check, and takes them off it", async () => {
    const { out, records, newcomers, joinFirst, join } = setup();
    void joinFirst([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(SECOND);
    await join([person(202)], 72, NOW + SECOND);
    expect(records.pendingOn(GROUP_ID, 5001).map((p) => p.user)).toEqual([201, 202]);
    // The update for 201's join comes 3 seconds late: they had been muted for a day by an admin before they left.
    newcomers.noteHeld(GROUP_ID, 201, mutedUntil(201, NOW + DAY), NOW + 3 * SECOND);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "restore")).toEqual([[GROUP_ID, 201, expect.objectContaining({ can_send_messages: false }), unix(NOW + DAY)]]);
    expect(records.pending(GROUP_ID, 201)).toBeNull();
    expect(records.isNewcomer(GROUP_ID, 201, NOW + DAY)).toBe(true);
    expect(callsOf(out.log, "edit").at(-1)?.[2]).not.toContain("id=201");
    // A tap now can't hand them text-only days that would lift it.
    await newcomers.onPress(press(person(201), "h:0", 5001), NOW + 4 * SECOND);
    expect(callsOf(out.log, "restrict").some((c) => c[1] === 201 && c[2] === TEXT_ONLY)).toBe(false);
  });

  it("never takes the check's own restriction, read back, for one that outlasts it", async () => {
    // Telegram answers with the restriction the check itself just made, to the second.
    const { out, records, joinFirst } = setup({ out: { member: async (_chat, user) => mutedUntil(user, NOW + 10 * MINUTE) } });
    void joinFirst([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(callsOf(out.log, "member")).toEqual([[GROUP_ID, 201, { fresh: true }]]);
    expect(callsOf(out.log, "restore")).toEqual([]);
    expect(records.pending(GROUP_ID, 201)).toMatchObject({ messageId: 5001 });
  });

  it("keeps a restriction without an end that the update shows, sending no end, as Telegram said it", async () => {
    const { out, newcomers, joinFirst } = setup();
    void joinFirst([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(100);
    newcomers.noteHeld(GROUP_ID, 201, mutedUntil(201, 0), NOW + 100);
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(callsOf(out.log, "restore")).toEqual([[GROUP_ID, 201, expect.objectContaining({ can_send_messages: false }), 0]]);
    expect(callsOf(out.log, "send")).toEqual([]);
  });
});

describe("an admin's mute kept across a leave (another bot's works the same)", () => {
  /** SAM was read as an ordinary member (kept 10 minutes), then muted for a day by an admin in the app, then left and came back a minute later. */
  async function rejoin(gapMs: number | null) {
    const bench = burstBench({ latencyMs: 50 });
    const SAM = 201;
    bench.tg.join(SAM);
    const read = bench.out.member(GROUP_ID, SAM);
    await vi.advanceTimersByTimeAsync(100);
    expect(await read).toMatchObject({ status: "member" });
    bench.tg.restrict(SAM, MUTED, unix(NOW + DAY));
    await bench.members.onMember({ chat: GROUP, from: person(1), date: unix(NOW), old_chat_member: { status: "member", user: person(SAM) }, new_chat_member: bench.tg.memberAt(SAM) });
    bench.tg.leave(SAM);
    await bench.members.onMember({ chat: GROUP, from: person(SAM), date: unix(NOW), old_chat_member: mutedUntil(SAM, NOW + DAY), new_chat_member: bench.tg.memberAt(SAM) });
    bench.joinBoth(MINUTE - 100, SAM, "message", gapMs);
    await vi.advanceTimersByTimeAsync(MINUTE + 10 * SECOND);
    bench.stop();
    return { bench, SAM };
  }

  for (const gapMs of [200, 3_000]) {
    it(`keeps it when the rejoin's update comes ${gapMs} ms after its joined message: no check, no text-only days`, async () => {
      const { bench, SAM } = await rejoin(gapMs);
      expect(bench.tg.memberAt(SAM)).toMatchObject({ status: "restricted", can_send_messages: false, until_date: unix(NOW + DAY) });
      expect(bench.records.pending(GROUP_ID, SAM)).toBeNull();
      expect(bench.records.isNewcomer(GROUP_ID, SAM, NOW + 2 * MINUTE)).toBe(true);
      expect(bench.calls.some((c) => c.method === "restrictChatMember" && (c.params.permissions as { can_send_messages: boolean }).can_send_messages)).toBe(false);
      // A check posted before the late update named them is gone with them.
      const checks = bench.of("sendMessage").filter((c) => String(c.params.text).includes("Tap the button"));
      const deleted = bench.of("deleteMessages").flatMap((c) => c.params.message_ids as number[]);
      expect(checks.length === 0 || deleted.includes(701)).toBe(true);
    });
  }

  it("reads them fresh, never from what was kept, when no update comes", async () => {
    const { bench, SAM } = await rejoin(null);
    const reads = bench.of("getChatMember").filter((c) => c.params.user_id === SAM);
    // The first read, before the mute, was kept; the join asks Telegram again (after the check restricted them).
    expect(reads).toHaveLength(2);
    expect(reads[1].at).toBeGreaterThanOrEqual(NOW + MINUTE + SECOND - 100);
    expect(bench.records.pending(GROUP_ID, SAM)).not.toBeNull();
  });
});
