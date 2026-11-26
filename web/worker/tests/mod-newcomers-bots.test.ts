import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminInfo, callsOf, fakeAdmins, GROUP_ID, OWNER_ID } from "./community-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, SECOND, setup, unix } from "./mod-newcomers-setup";

const SPAM = { id: 8_001, is_bot: true, first_name: "Spam", username: "spammybot" };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("bots added to the group", () => {
  it("bans a bot a member added even when the join is over 5 minutes old (added while the worker was down)", async () => {
    const { out, alerts, newcomers } = setup();
    await newcomers.onJoin(GROUP_ID, [SPAM], person(201), 80, unix(NOW - 10 * MINUTE), NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "ban")).toEqual([[GROUP_ID, SPAM.id]]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "action", category: "bot_added", undo: "ban" })]);
  });

  it("keeps a stale bot an admin added, or one that is allowed", async () => {
    const { out, newcomers } = setup();
    await newcomers.onJoin(GROUP_ID, [SPAM], person(OWNER_ID), 80, unix(NOW - 10 * MINUTE), NOW);
    await newcomers.onJoin(GROUP_ID, [{ id: 8_003, is_bot: true, first_name: "Good", username: "GoodHelperBot" }], person(201), 81, unix(NOW - 10 * MINUTE), NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "ban")).toEqual([]);
  });

  it("tries a ban Telegram refused once more, 10 seconds later, and says what took", async () => {
    let bans = 0;
    const { out, alerts, newcomers } = setup({ out: { ban: async () => (bans += 1) > 1 } });
    await newcomers.onJoin(GROUP_ID, [SPAM], person(201), 80, unix(NOW), NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "ban")).toHaveLength(1);
    expect(alerts).toEqual([]);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(callsOf(out.log, "ban")).toEqual([[GROUP_ID, SPAM.id], [GROUP_ID, SPAM.id]]);
    expect(alerts).toEqual([expect.objectContaining({ category: "bot_added", undo: "ban" })]);
  });

  it("tries only once more: a ban refused twice is reported without an Undo", async () => {
    const { out, alerts, newcomers } = setup({ out: { ban: async () => false } });
    await newcomers.onJoin(GROUP_ID, [SPAM], person(201), 80, unix(NOW), NOW);
    await vi.advanceTimersByTimeAsync(30 * SECOND);
    expect(callsOf(out.log, "ban")).toHaveLength(2);
    expect(alerts).toEqual([expect.objectContaining({ category: "bot_added", undo: null })]);
  });

  it("leaves a bot that is itself an admin alone", async () => {
    const admins = fakeAdmins({ [GROUP_ID]: [adminInfo(OWNER_ID), adminInfo(SPAM.id)] });
    const { out, newcomers } = setup({ admins });
    await newcomers.onJoin(GROUP_ID, [SPAM], person(201), 80, unix(NOW), NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "ban")).toEqual([]);
  });
});
