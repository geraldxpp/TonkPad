// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramError } from "../src/telegram/api";
import { communityWords } from "../src/telegram/i18n/community";
import { escapeHtml } from "../src/telegram/text";
import { ADMIN_CHAT_ID, GROUP_ID, groupMessage, OWNER_ID } from "./community-fixtures";
import { person } from "./community-pipeline-fixtures";
import { type Answer, badGateway, type Call, READY, sentTo, startBench, user } from "./community-start-fixtures";
import { NOW, SEC } from "./fixtures";

/**
 * Starting over the real wiring (wiring#2, wiring#3): an admin chat
 * Telegram refuses for certain turns community mode off; while its checks
 * wait, a report is told reports aren't set up yet; and a group whose admin
 * list can't be read is moderated as in observe mode (protective deletes
 * only) until it is, so its admins are never punished as members.
 */

let dir = "";
const benches: Array<ReturnType<typeof startBench>> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "community-start-wiring-"));
  vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(async () => {
  for (const b of benches.splice(0)) b.stop();
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function setup(options: Parameters<typeof startBench>[1] = {}) {
  const b = startBench(dir, { ...options, telegram: { deleteMessages: () => true, restrictChatMember: () => true, ...options.telegram } });
  b.deps.now = () => Date.now();
  benches.push(b);
  return b;
}

const adminChat = (answer: Answer): Answer => (p) => (p.chat_id === ADMIN_CHAT_ID ? answer(p) : READY.getChat(p));
/** Message IDs deleteMessages was asked to delete in a chat. */
const deleted = (calls: readonly Call[], chat: number) => calls.filter((c) => c.method === "deleteMessages" && c.params.chat_id === chat).flatMap((c) => c.params.message_ids as number[]);
const restricted = (calls: readonly Call[]) => calls.filter((c) => c.method === "restrictChatMember");
const UNKNOWN_LINK = "New guide is up: https://some-unknown-site.example/guide";

describe("an admin chat Telegram refuses (wiring#2)", () => {
  it("turns community mode off at start on a 400 'chat not found', at the first answer, with a clear log line", async () => {
    const s = setup({ telegram: { getChat: adminChat(() => Promise.reject(new TelegramError(400, "Bad Request: chat not found", null))) } });
    expect(await s.start()).toBeNull();
    const logs = s.logs.join("\n");
    expect(logs).toContain("community mode off: the admin chat can't be reached (Telegram says 400: Bad Request: chat not found)");
    expect(logs).toContain("community off: the admin chat failed its checks");
    expect(s.api.calls.filter((c) => c.method === "getChat" && c.params.chat_id === ADMIN_CHAT_ID)).toHaveLength(1);
  });

  it("says a 403 or an upgrade to a supergroup the same way, with the upgrade's new ID to set", async () => {
    const kicked = setup({ telegram: { getChat: adminChat(() => Promise.reject(new TelegramError(403, "Forbidden: bot was kicked from the supergroup chat", null))) } });
    expect(await kicked.start()).toBeNull();
    const moved = setup({ telegram: { getChat: adminChat(() => Promise.reject(new TelegramError(400, "Bad Request: group chat was upgraded to a supergroup chat", null))) } });
    expect(await moved.start()).toBeNull();
    expect(moved.logs.join("\n")).toContain("set TELEGRAM_ADMIN_CHAT_ID to the new -100… ID");
  });

  it("tells a group reporter reports aren't set up yet while the admin chat's checks wait, and the admins never get it", async () => {
    let down = true;
    const s = setup({ telegram: { getChat: adminChat((p) => (down ? Promise.reject(badGateway()) : READY.getChat(p))) } });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    const target = groupMessage("hello there, anyone around?", { from: person(555) });
    await hooks?.onMessage(groupMessage("/report", { reply_to_message: target }), false);
    await vi.advanceTimersByTimeAsync(SEC);
    expect(sentTo(s.api.calls, GROUP_ID)).toContain(escapeHtml(communityWords("en").report.noAdminChat));
    expect(sentTo(s.api.calls, GROUP_ID)).not.toContain(escapeHtml(communityWords("en").report.thanks));
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(hooks?.isAdminChat(ADMIN_CHAT_ID)).toBe(true);
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID).some((text) => text.includes("Member555"))).toBe(false);
  });
});

describe("admin lists at start (wiring#3)", () => {
  it("reads a group's admin list again at start when one read fails, so the creator's link is never moderated", async () => {
    let fails = 1;
    const s = setup({ env: { TELEGRAM_COMMUNITY_MODE: "normal" }, telegram: { getChatAdministrators: (p) => (fails-- > 0 ? Promise.reject(badGateway()) : READY.getChatAdministrators(p)) } });
    const hooks = await s.start();
    expect(s.api.calls.filter((c) => c.method === "getChatAdministrators")).toHaveLength(2);
    const creator = groupMessage(UNKNOWN_LINK, { from: user(OWNER_ID) });
    await hooks?.onMessage(creator, false);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(deleted(s.api.calls, GROUP_ID)).toEqual([]);
    expect(sentTo(s.api.calls, GROUP_ID)).toEqual([]);
    // The same link from a member goes, in normal mode.
    const member = groupMessage(UNKNOWN_LINK, { from: person(4_242) });
    await hooks?.onMessage(member, false);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(deleted(s.api.calls, GROUP_ID)).toEqual([member.message_id]);
  });

  it("moderates a group as observe mode while its admin list can't be read, then as set once the tick reads it", async () => {
    let down = true;
    const s = setup({ env: { TELEGRAM_COMMUNITY_MODE: "normal" }, telegram: { getChatAdministrators: (p) => (down ? Promise.reject(badGateway()) : READY.getChatAdministrators(p)) } });
    const hooks = await s.start();
    expect(s.logs.join("\n")).toContain(`community group ${GROUP_ID}: its admin list can't be read yet`);
    const creator = groupMessage(UNKNOWN_LINK, { from: user(OWNER_ID) });
    const unknown = groupMessage(UNKNOWN_LINK, { from: person(4_242) });
    const lookalike = groupMessage("everyone go to tonkfun-claim.xyz", { from: person(4_243) });
    for (const m of [creator, unknown, lookalike]) await hooks?.onMessage(m, false);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    // Only the protective delete: no unknown link removed, nobody muted or warned.
    expect(deleted(s.api.calls, GROUP_ID)).toEqual([lookalike.message_id]);
    expect(restricted(s.api.calls)).toEqual([]);
    expect(sentTo(s.api.calls, GROUP_ID).some((text) => text.includes(`tg://user?id=${OWNER_ID}`))).toBe(false);
    down = false;
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(s.logs.join("\n")).toContain(`community group ${GROUP_ID}: its admin list was read`);
    const later = groupMessage(UNKNOWN_LINK, { from: person(4_244) });
    const creatorAgain = groupMessage(UNKNOWN_LINK, { from: user(OWNER_ID) });
    for (const m of [later, creatorAgain]) await hooks?.onMessage(m, false);
    await vi.advanceTimersByTimeAsync(2 * SEC);
    expect(deleted(s.api.calls, GROUP_ID)).toEqual([lookalike.message_id, later.message_id]);
  });
});
