import { beforeEach, describe, expect, it } from "vitest";
import { createSetupRetry, type SetupRetryDeps } from "../src/telegram/community/setup-retry";
import type { ChatId } from "../src/telegram/community/types";
import { ADMIN_CHAT_ID, BOT_ID, callsOf, GROUP_ID, OWNER_ID, recordOut } from "./community-fixtures";
import { bench, but, type ChatAnswer, type Places, READY, SECOND_GROUP } from "./community-setup-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

/** The setup checks Telegram couldn't answer at start, asked again from the tick (robustness#5). */

/** A retry over the setup bench: what it calls back, in order. Each read asks `places` and `chats` again, so a test can change what Telegram says between rounds. */
function retryBench(places: () => Places, options: { chats?: () => Record<number, ChatAnswer | null>; retry?: Partial<SetupRetryDeps> } = {}) {
  const out = recordOut({
    member: async (chat, user) => {
      const place = places()[chat]?.[user];
      return place === null ? null : { status: "member", user: { id: user }, ...place };
    },
    chat: async (chat) => {
      const given = options.chats?.()[chat];
      if (given === null) return null;
      return { id: chat, type: "supergroup", title: chat === ADMIN_CHAT_ID ? "Team" : "tonkfun.fun community", message_auto_delete_time: 86_400, ...given };
    },
  });
  const { deps, alerts } = bench(READY, { extra: { out } });
  const heard: string[] = [];
  const logs: string[] = [];
  const retry = createSetupRetry({
    setup: deps, adminChat: false, chats: [], log: (line) => void logs.push(line), now: NOW,
    passed: (autoDelete) => void heard.push(`passed:${autoDelete}`),
    failed: () => void heard.push("failed"),
    drop: (chat: ChatId) => void heard.push(`drop:${chat}`),
    ...options.retry,
  });
  return { retry, heard, logs, alerts, out };
}

/** The tick's clock: each run goes on from where the last one stopped. */
let clock = NOW;
beforeEach(() => {
  clock = NOW;
});

/** Ticks every 5 seconds for `ms`. */
async function run(retry: { tick(now: number): Promise<void> }, ms: number): Promise<void> {
  for (const end = clock + ms; clock < end; ) {
    clock += 5 * SEC;
    await retry.tick(clock);
  }
}

describe("createSetupRetry", () => {
  it("asks 30 seconds after start, then backs off to every 10 minutes while Telegram can't answer", async () => {
    const { retry, heard, out } = retryBench(() => READY, { chats: () => ({ [ADMIN_CHAT_ID]: null }), retry: { adminChat: true } });
    await run(retry, 59 * MIN);
    const rounds = callsOf(out.log, "chat").length;
    // 30 s, then 1, 2, 4, 8 and 10 minutes apart: 9 rounds in the first hour, not one a tick.
    expect(rounds).toBeGreaterThanOrEqual(8);
    expect(rounds).toBeLessThanOrEqual(10);
    expect(heard).toEqual([]);
    expect(retry.waiting()).toBe(true);
  });

  it("turns community mode off when the admin chat is still unanswered an hour after start, and asks no more (wiring#2)", async () => {
    const { retry, heard, logs, out } = retryBench(() => READY, { chats: () => ({ [ADMIN_CHAT_ID]: null }), retry: { adminChat: true } });
    await run(retry, 60 * MIN);
    expect(heard).toEqual(["failed"]);
    expect(logs.join("\n")).toContain("community off: the admin chat still can't be read an hour after start");
    expect(retry.waiting()).toBe(false);
    const rounds = callsOf(out.log, "chat").length;
    await run(retry, 60 * MIN);
    expect(callsOf(out.log, "chat")).toHaveLength(rounds);
    expect(heard).toEqual(["failed"]);
  });

  it("never gives up on a group that is still unsure: it runs, and is asked again", async () => {
    const { retry, heard } = retryBench(() => but(GROUP_ID, BOT_ID, null), { retry: { chats: [GROUP_ID] } });
    await run(retry, 3 * 60 * MIN);
    expect(heard).toEqual([]);
    expect(retry.waiting()).toBe(true);
  });

  it("opens the admin chat once its checks pass, with the auto-delete timer as read, and then stops asking", async () => {
    let down = true;
    const { retry, heard, logs, out } = retryBench(() => READY, { chats: () => ({ [ADMIN_CHAT_ID]: down ? null : { message_auto_delete_time: undefined } }), retry: { adminChat: true } });
    await run(retry, 20 * SEC);
    expect(heard).toEqual([]);
    down = false;
    await run(retry, 2 * MIN);
    expect(heard).toEqual(["passed:long"]);
    expect(logs).toContain("the admin chat passed its checks: its alerts go out now");
    expect(retry.waiting()).toBe(false);
    const reads = out.log.length;
    await run(retry, 60 * MIN);
    expect(out.log).toHaveLength(reads);
  });

  it("turns community mode off once Telegram says for certain the admin chat fails", async () => {
    let answer: ChatAnswer | null = null;
    const { retry, heard, alerts } = retryBench(() => READY, { chats: () => ({ [ADMIN_CHAT_ID]: answer }), retry: { adminChat: true, chats: [GROUP_ID] } });
    await run(retry, 20 * SEC);
    answer = { username: "team_public" };
    await run(retry, 2 * MIN);
    expect(heard).toEqual(["failed"]);
    expect(alerts).toEqual([]);
    expect(retry.waiting()).toBe(false);
  });

  it("drops a group only once Telegram says the bot lacks a right, with its alert, and keeps one that passes", async () => {
    let places: Places = but(GROUP_ID, BOT_ID, null);
    places = { ...places, [SECOND_GROUP]: { ...places[SECOND_GROUP], [BOT_ID]: null } };
    const { retry, heard, logs, alerts } = retryBench(() => places, { retry: { chats: [GROUP_ID, SECOND_GROUP] } });
    await run(retry, 2 * MIN);
    expect(heard).toEqual([]);
    places = { ...READY, [SECOND_GROUP]: { ...READY[SECOND_GROUP], [BOT_ID]: { status: "administrator", can_delete_messages: true } } };
    await run(retry, 5 * MIN);
    expect(heard).toEqual([`drop:${SECOND_GROUP}`]);
    expect(alerts).toEqual([expect.objectContaining({ chat: SECOND_GROUP, kind: "rights" })]);
    expect(logs).toContain(`community group ${GROUP_ID} passed its checks`);
    expect(logs).toContain(`community group ${SECOND_GROUP} dropped: the bot lacks Ban users there`);
    expect(retry.waiting()).toBe(false);
  });

  it("reads a group's getChat again until it answers, and never rejects", async () => {
    let tries = 0;
    const readInfo = async (chat: ChatId) => {
      tries += 1;
      if (tries === 1) throw new Error("network");
      return chat === GROUP_ID && tries >= 3;
    };
    const { retry } = retryBench(() => READY, { retry: { unread: [GROUP_ID], readInfo } });
    expect(retry.waiting()).toBe(true);
    await run(retry, 10 * MIN);
    expect(tries).toBe(3);
    expect(retry.waiting()).toBe(false);
  });

  it("checks each owner's place too: a group stays unsure while no owner's place can be read", async () => {
    let owner: Places[number][number] = null;
    const { retry, heard } = retryBench(() => ({ ...READY, [GROUP_ID]: { ...READY[GROUP_ID], [OWNER_ID]: owner } }), { retry: { chats: [GROUP_ID] } });
    await run(retry, 2 * MIN);
    expect(retry.waiting()).toBe(true);
    owner = { status: "member" };
    await run(retry, 5 * MIN);
    expect(heard).toEqual([`drop:${GROUP_ID}`]);
  });
});
