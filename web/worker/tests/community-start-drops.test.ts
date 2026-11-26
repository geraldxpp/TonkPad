// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_CHAT_ID, BOT_ID, GROUP_ID, groupMessage } from "./community-fixtures";
import { person } from "./community-pipeline-fixtures";
import { type Answer, badGateway, type Call, READY, SECOND_GROUP, startBench, user } from "./community-start-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

/**
 * What happens to a group, and to what the bot scheduled, when community
 * mode stops running it: a group dropped at runtime ends its new-member
 * checks unpunished (wiring#1); a group the bot was removed from loses its
 * records (newcomers#7); and after community mode turns off, the deletes it
 * scheduled still go when due (wiring#4).
 */

let dir = "";
const benches: Array<ReturnType<typeof startBench>> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "community-start-drops-"));
  vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(async () => {
  for (const b of benches.splice(0)) b.stop();
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** sendMessage with a new message ID each time, from 200. */
function numbered(): Answer {
  let id = 200;
  return (p) => ({ message_id: (id += 1), date: Math.floor(Date.now() / 1000), chat: { id: p.chat_id, type: "supergroup" } });
}

function setup(options: Parameters<typeof startBench>[1] = {}) {
  const telegram = { sendMessage: numbered(), deleteMessages: () => true, restrictChatMember: () => true, unbanChatMember: () => true, banChatMember: () => true, ...options.telegram };
  const b = startBench(dir, { ...options, telegram });
  b.deps.now = () => Date.now();
  benches.push(b);
  return b;
}

const path = () => join(dir, "community.json");
const saved = async () => JSON.parse(await readFile(path(), "utf8")) as { deletes: Array<{ messageId: number }>; warnings: Record<string, unknown>; trusted: Record<string, unknown> };
const deleted = (calls: readonly Call[], chat: number) => calls.filter((c) => c.method === "deleteMessages" && c.params.chat_id === chat).flatMap((c) => c.params.message_ids as number[]);
const calledFor = (calls: readonly Call[], method: string, person: number) => calls.filter((c) => c.method === method && c.params.user_id === person);
/** The bot's place in a group: 502 while `down()` says so, then `place`. */
const botIn = (chat: number, down: () => boolean, place: Record<string, unknown>): Answer => (p) => {
  if (p.chat_id !== chat || p.user_id !== BOT_ID) return READY.getChatMember(p);
  return down() ? Promise.reject(badGateway()) : { ...place, user: user(BOT_ID) };
};

describe("a group dropped while it runs (wiring#1)", () => {
  it("ends its pending new-member checks without punishment: the check goes, the restriction lifts, nobody is removed at the deadline", async () => {
    let down = true;
    const s = setup({ env: { TELEGRAM_COMMUNITY_MODE: "normal" }, telegram: { getChatMember: botIn(GROUP_ID, () => down, { status: "administrator", can_restrict_members: true }) } });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    const NEWCOMER = 555;
    await hooks?.onMessage(groupMessage("", { text: undefined, from: user(NEWCOMER), new_chat_members: [user(NEWCOMER)] }), false);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(calledFor(s.api.calls, "restrictChatMember", NEWCOMER)).toHaveLength(1);
    const check = s.api.calls.find((c) => c.method === "sendMessage" && c.params.chat_id === GROUP_ID && JSON.stringify(c.params.reply_markup ?? "").includes('"h:'));
    expect(check).toBeDefined();
    // Telegram now says for certain the bot lacks Delete messages there: the group is dropped at the next check.
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(hooks?.owns(GROUP_ID)).toBe(false);
    const lifts = calledFor(s.api.calls, "restrictChatMember", NEWCOMER);
    expect((lifts.at(-1)?.params.permissions as Record<string, unknown>)?.can_send_messages).toBe(true);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(calledFor(s.api.calls, "unbanChatMember", NEWCOMER)).toEqual([]);
    expect(calledFor(s.api.calls, "banChatMember", NEWCOMER)).toEqual([]);
  });
});

describe("a group the bot isn't in any more (newcomers#7)", () => {
  const offence = { n: 1, certain: 1, last: NOW - 60_000, category: "phishing" };
  const state = () => writeFile(path(), JSON.stringify({
    v: 1, warnings: { [GROUP_ID]: { 101: offence }, [SECOND_GROUP]: { 101: offence } },
    trusted: { [GROUP_ID]: { 102: { since: NOW - 60_000, name: "0123456789abcdef" } }, [SECOND_GROUP]: { 102: { since: NOW - 60_000, name: "0123456789abcdef" } } },
  }));

  it("forgets its records at start when the bot was removed from it, and keeps them where only a right is missing", async () => {
    await state();
    const s = setup({
      env: { TELEGRAM_COMMUNITY_CHATS: `${GROUP_ID},${SECOND_GROUP}` },
      telegram: { getChatMember: (p) => (p.user_id !== BOT_ID ? READY.getChatMember(p) : { ...(p.chat_id === SECOND_GROUP ? { status: "kicked" } : { status: "administrator", can_delete_messages: true }), user: user(BOT_ID) }) },
    });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(false);
    expect(hooks?.owns(SECOND_GROUP)).toBe(false);
    await hooks?.save();
    const after = await saved();
    expect(Object.keys(after.warnings)).toEqual([String(GROUP_ID)]);
    expect(Object.keys(after.trusted)).toEqual([String(GROUP_ID)]);
    expect(s.logs.join("\n")).toContain(`community group ${SECOND_GROUP} dropped: the bot isn't in it any more`);
  });

  it("forgets them when a later check finds the bot removed", async () => {
    await state();
    let down = true;
    const s = setup({ telegram: { getChatMember: botIn(GROUP_ID, () => down, { status: "left" }) } });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(hooks?.owns(GROUP_ID)).toBe(false);
    await hooks?.save();
    const after = await saved();
    expect(after.warnings).toEqual({});
    expect(after.trusted).toEqual({});
  });

  it("keeps them when a later check finds only a missing right", async () => {
    await state();
    let down = true;
    const s = setup({ telegram: { getChatMember: botIn(GROUP_ID, () => down, { status: "administrator", can_restrict_members: true }) } });
    const hooks = await s.start();
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(hooks?.owns(GROUP_ID)).toBe(false);
    await hooks?.save();
    const after = await saved();
    expect(Object.keys(after.warnings)).toEqual([String(GROUP_ID)]);
    expect(Object.keys(after.trusted)).toEqual([String(GROUP_ID)]);
  });

  it("forgets them at start though community mode then turns off, the admin chat failing for certain", async () => {
    await state();
    const s = setup({
      env: { TELEGRAM_COMMUNITY_CHATS: `${GROUP_ID},${SECOND_GROUP}` },
      telegram: {
        getChat: (p) => (p.chat_id === ADMIN_CHAT_ID ? { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team", username: "team_public" } : READY.getChat(p)),
        getChatMember: botIn(SECOND_GROUP, () => false, { status: "kicked" }),
      },
    });
    expect(await s.start()).toBeNull();
    const after = await saved();
    expect(Object.keys(after.warnings)).toEqual([String(GROUP_ID)]);
    expect(Object.keys(after.trusted)).toEqual([String(GROUP_ID)]);
  });
});

describe("after community mode turns off (wiring#4)", () => {
  it("still deletes a /report note once its 30 seconds are up, though community mode turned off meanwhile", async () => {
    let check: "down" | "public" = "down";
    const s = setup({
      telegram: {
        getChat: (p) => (p.chat_id !== ADMIN_CHAT_ID ? READY.getChat(p) : check === "down" ? Promise.reject(badGateway()) : { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team", username: "team_public" }),
      },
    });
    const hooks = await s.start();
    await vi.advanceTimersByTimeAsync(20 * SEC);
    const target = groupMessage("hello there", { from: person(556) });
    await hooks?.onMessage(groupMessage("/report", { reply_to_message: target }), false);
    await vi.advanceTimersByTimeAsync(SEC);
    // The public note, not its ephemeral copy to the reporter: numbered() gave it the ID after those sent before it.
    const sends = s.api.calls.filter((c) => c.method === "sendMessage");
    const index = sends.findIndex((c) => c.params.chat_id === GROUP_ID && !("ephemeral_message_parameters" in c.params));
    expect(index).toBeGreaterThanOrEqual(0);
    const noteId = 201 + index;
    check = "public";
    await vi.advanceTimersByTimeAsync(20 * SEC);
    expect(hooks?.health()).toEqual({ enabled: false });
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(deleted(s.api.calls, GROUP_ID)).toContain(noteId);
  });

  it("still makes the deletes the last run scheduled when community mode is off at start, then stops", async () => {
    await writeFile(path(), JSON.stringify({ v: 1, deletes: [{ chat: GROUP_ID, messageId: 4_321, due: NOW - 1_000, added: NOW - 60_000 }] }));
    const s = setup({ telegram: { getChat: (p) => (p.chat_id === ADMIN_CHAT_ID ? { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team", username: "team_public" } : READY.getChat(p)) } });
    expect(await s.start()).toBeNull();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(deleted(s.api.calls, GROUP_ID)).toEqual([4_321]);
    // Done: it leaves the saved records (written for real, so the test waits for the file).
    await vi.advanceTimersByTimeAsync(10 * SEC);
    await vi.waitFor(async () => expect((await saved()).deletes).toEqual([]), { timeout: 2_000 });
    const calls = s.api.calls.length;
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(s.api.calls).toHaveLength(calls);
  });
});
