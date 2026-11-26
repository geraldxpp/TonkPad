// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_CHAT_ID, BOT_ID, GROUP_ID, testWords } from "./community-fixtures";
import { type Answer, badGateway, READY, SECOND_GROUP, sentTo, startBench, user } from "./community-start-fixtures";
import { NOW, SEC } from "./fixtures";

/**
 * Setup checks Telegram can't answer at start (robustness#5): a failed read
 * is tried again, then the community runs as unsure and is checked again
 * from the tick; only a definite answer drops a group or turns community
 * mode off. The admin chat's auto-delete timer is checked too (K14).
 */

let dir = "";
const benches: Array<ReturnType<typeof startBench>> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "community-start-setup-"));
  vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(async () => {
  for (const b of benches.splice(0)) b.stop();
  vi.useRealTimers();
  // A save may still be writing community.json.
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** A bench on the fake clock: Date.now moves with the timers. */
function setup(options: Parameters<typeof startBench>[1] = {}) {
  const b = startBench(dir, options);
  b.deps.now = () => Date.now();
  benches.push(b);
  return b;
}

/** Telegram's answer while `down()` says it is down: a 502. */
const unless = (down: () => boolean, answer: Answer): Answer => (p) => {
  if (down()) throw badGateway();
  return answer(p);
};

describe("starting while Telegram can't answer", () => {
  it("tries the admin chat's getChat again at start, so one 502 changes nothing", async () => {
    let fails = 1;
    const s = setup({ telegram: { getChat: (p) => (p.chat_id === ADMIN_CHAT_ID && fails-- > 0 ? Promise.reject(badGateway()) : READY.getChat(p)) } });
    const hooks = await s.start();
    expect(hooks?.isAdminChat(ADMIN_CHAT_ID)).toBe(true);
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    expect(s.logs.join("\n")).not.toContain("community off");
  });

  it("runs while the admin chat can't be read, holds its alerts, and opens it when a later check passes", async () => {
    let down = true;
    let changes = 0;
    const s = setup({
      env: { TELEGRAM_COMMUNITY_CHATS: `${GROUP_ID},${SECOND_GROUP}` },
      telegram: {
        getChat: (p) => (p.chat_id === ADMIN_CHAT_ID && down ? Promise.reject(badGateway()) : READY.getChat(p)),
        // The second group lacks the bot's rights for certain: its alert waits for the admin chat.
        getChatMember: (p) => (p.chat_id === SECOND_GROUP && p.user_id === BOT_ID ? { status: "member", user: user(BOT_ID) } : READY.getChatMember(p)),
      },
      onChange: () => void (changes += 1),
    });
    const hooks = await s.start();
    expect(hooks).not.toBeNull();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    expect(hooks?.owns(SECOND_GROUP)).toBe(false);
    // Not the community's yet: nothing goes there, and its commands are module 14's.
    expect(hooks?.isAdminChat(ADMIN_CHAT_ID)).toBe(false);
    expect(s.logs.join("\n")).toContain("the admin chat can't be read yet");
    expect(s.logs.join("\n")).toContain("checks Telegram couldn't answer are tried again shortly");
    await vi.advanceTimersByTimeAsync(20 * SEC);
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID)).toEqual([]);
    down = false;
    await vi.advanceTimersByTimeAsync(20 * SEC);
    expect(hooks?.isAdminChat(ADMIN_CHAT_ID)).toBe(true);
    expect(changes).toBe(1);
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID).some((text) => text.includes("missing a right") || text.includes("Delete messages and Ban users"))).toBe(true);
    expect(s.logs).toContain("the admin chat passed its checks: its alerts go out now");
  });

  it("turns community mode off when a later check finds the admin chat public, and says so to the menus", async () => {
    let down = true;
    let changes = 0;
    const s = setup({
      telegram: { getChat: (p) => (p.chat_id !== ADMIN_CHAT_ID ? READY.getChat(p) : down ? Promise.reject(badGateway()) : { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team", username: "team_public" }) },
      onChange: () => void (changes += 1),
    });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(hooks?.owns(GROUP_ID)).toBe(false);
    expect(hooks?.health()).toEqual({ enabled: false });
    expect(hooks?.aiOn()).toBe(false);
    // The menus hear of it once community.json is saved.
    await vi.waitFor(() => expect(changes).toBe(1));
    expect(s.logs.join("\n")).toContain("community off: the admin chat failed its checks");
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID)).toEqual([]);
  });

  it("keeps a group whose bot rights can't be read, without a false alert, and drops it once Telegram says the rights are missing", async () => {
    let down = true;
    let changes = 0;
    const bot: Answer = (p) => (p.chat_id === GROUP_ID && p.user_id === BOT_ID ? { status: "member", user: user(BOT_ID) } : READY.getChatMember(p));
    const s = setup({ telegram: { getChatMember: (p) => (p.chat_id === GROUP_ID && p.user_id === BOT_ID ? unless(() => down, bot)(p) : READY.getChatMember(p)) }, onChange: () => void (changes += 1) });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    expect(s.logs.join("\n")).toContain(`community group ${GROUP_ID}: its checks can't be read yet`);
    expect(s.logs.join("\n")).not.toContain("community started: 0 groups");
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID)).toEqual([]);
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(hooks?.owns(GROUP_ID)).toBe(false);
    expect(changes).toBe(1);
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID)).toHaveLength(1);
  });

  it("reads a group's getChat again from the tick when it failed at start", async () => {
    let down = true;
    const s = setup({ telegram: { getChat: (p) => (p.chat_id === GROUP_ID && down ? Promise.reject(badGateway()) : READY.getChat(p)) } });
    await s.start();
    const reads = () => s.api.calls.filter((c) => c.method === "getChat" && c.params.chat_id === GROUP_ID).length;
    const before = reads();
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(reads()).toBeGreaterThan(before);
    const after = reads();
    // Read once it answered: not again.
    await vi.advanceTimersByTimeAsync(30 * 60 * SEC);
    expect(s.api.calls.filter((c) => c.method === "getChat" && c.params.chat_id === GROUP_ID).length - after).toBeLessThanOrEqual(3);
  });
});

describe("the admin chat's auto-delete timer", () => {
  it("alerts once at start when it is off, and not again at the hourly check while it stays off", async () => {
    const s = setup({ telegram: { getChat: (p) => (p.chat_id === ADMIN_CHAT_ID ? { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team" } : READY.getChat(p)) } });
    await s.start();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    const autoDelete = (calls: typeof s.api.calls) => sentTo(calls, ADMIN_CHAT_ID).filter((text) => text.includes("auto-delete"));
    expect(autoDelete(s.api.calls)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * SEC);
    expect(autoDelete(s.api.calls)).toHaveLength(1);
    expect(testWords.admin.setup.autoDelete).toContain("auto-delete");
  });

  it("says nothing when it is a week or less", async () => {
    const s = setup();
    await s.start();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * SEC);
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID).filter((text) => text.includes("auto-delete"))).toEqual([]);
  });
});
