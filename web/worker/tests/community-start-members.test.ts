// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TgChatMember, TgChatMemberUpdated, TgMessage } from "../src/telegram/types";
import { GROUP, GROUP_ID, OWNER_ID } from "./community-fixtures";
import { type Call, startBench, user } from "./community-start-fixtures";
import { NOW, SEC } from "./fixtures";

/**
 * telegram-out keeps a member's getChatMember answer for 10 minutes, and
 * every update about them makes it stale (newcomers#4): wired in
 * index-build.ts, members.ts drops it at each chat_member update, so the
 * next read about that person asks Telegram again.
 */

let dir = "";
const benches: Array<ReturnType<typeof startBench>> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "community-start-members-"));
  vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(async () => {
  for (const b of benches.splice(0)) b.stop();
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function setup() {
  const b = startBench(dir, { telegram: { deleteMessages: () => true } });
  b.deps.now = () => Date.now();
  benches.push(b);
  return b;
}

const MEMBER_ID = 4_321;
const OTHER_ID = 4_322;
let nextId = 500;
/** A private "/start appeal": the review view reads the member's place in each community group. */
const appeal = (id = MEMBER_ID): TgMessage => ({ message_id: (nextId += 1), date: Math.floor(Date.now() / 1000), chat: { id, type: "private" }, from: user(id), text: "/start appeal" });
/** Telegram's getChatMember calls about one person in the community group. */
const reads = (calls: readonly Call[], id = MEMBER_ID) => calls.filter((c) => c.method === "getChatMember" && c.params.chat_id === GROUP_ID && c.params.user_id === id).length;
/** A chat_member update about a member, made by the owner. */
const update = (id: number, before: Partial<TgChatMember>, after: Partial<TgChatMember>): TgChatMemberUpdated => ({
  chat: GROUP, from: user(OWNER_ID), date: Math.floor(Date.now() / 1000),
  old_chat_member: { status: "member", user: user(id), ...before }, new_chat_member: { status: "member", user: user(id), ...after },
});
const MUTED: Partial<TgChatMember> = { status: "restricted", is_member: true, can_send_messages: false, until_date: 0 };

describe("a member's getChatMember answer after an update about them (newcomers#4)", () => {
  it("is read from Telegram again after a chat_member update, and kept before it", async () => {
    const s = setup();
    const hooks = await s.start();
    expect(hooks).not.toBeNull();
    await hooks?.startPrivate(appeal(), "appeal");
    await vi.advanceTimersByTimeAsync(SEC);
    expect(reads(s.api.calls)).toBe(1);
    // Kept: the same view a moment later asks Telegram nothing.
    await hooks?.startPrivate(appeal(), "appeal");
    await vi.advanceTimersByTimeAsync(SEC);
    expect(reads(s.api.calls)).toBe(1);
    // An admin mutes them: what Telegram said before is stale now.
    await hooks?.onMember(update(MEMBER_ID, {}, MUTED));
    await hooks?.startPrivate(appeal(), "appeal");
    await vi.advanceTimersByTimeAsync(SEC);
    expect(reads(s.api.calls)).toBe(2);
  });

  it("forgets only the person the update is about", async () => {
    const s = setup();
    const hooks = await s.start();
    await hooks?.startPrivate(appeal(MEMBER_ID), "appeal");
    await hooks?.startPrivate(appeal(OTHER_ID), "appeal");
    await vi.advanceTimersByTimeAsync(SEC);
    await hooks?.onMember(update(MEMBER_ID, {}, MUTED));
    await hooks?.startPrivate(appeal(MEMBER_ID), "appeal");
    await hooks?.startPrivate(appeal(OTHER_ID), "appeal");
    await vi.advanceTimersByTimeAsync(SEC);
    expect(reads(s.api.calls, MEMBER_ID)).toBe(2);
    expect(reads(s.api.calls, OTHER_ID)).toBe(1);
  });
});
