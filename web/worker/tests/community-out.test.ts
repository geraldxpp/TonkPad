import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramError } from "../src/telegram/api";
import { Sender } from "../src/telegram/sender";
import { ADMIN_CHAT_ID, GROUP_ID } from "./community-fixtures";
import { fakeApi, outBench, texts } from "./community-out-fixtures";
import { NOW } from "./fixtures";

const KEYBOARD = { inline_keyboard: [[{ text: "Why? Ask for a review", url: "https://t.me/TonkfunBot?start=appeal" }]] };
const PRIVATE_CHAT = 4_242;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Sender.waiting", () => {
  it("counts the calls queued for a key, the one being sent included", async () => {
    const { api } = fakeApi();
    const sender = new Sender(api, () => undefined, () => Date.now());
    const sends = [1, 2, 3].map(() => sender.toChat("g:answer", 3_000, "sendMessage", {}));
    expect(sender.waiting("g:answer")).toBe(3);
    expect(sender.waiting("g:notice")).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(sender.waiting("g:answer")).toBe(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(sender.waiting("g:answer")).toBe(1);
    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.all(sends);
    expect(sender.waiting("g:answer")).toBe(0);
  });
});

describe("createTelegramOut: sends and edits", () => {
  it("sends HTML without link previews, in the topic and replying to the message, and returns the new ID", async () => {
    const { out, of } = outBench();
    expect(await out.send(GROUP_ID, "<b>On fees:</b> 1%", { kind: "answer", replyTo: 55, thread: 7, keyboard: KEYBOARD })).toBe(701);
    expect(await out.send(GROUP_ID, "plain", { kind: "notice" })).toBe(702);
    const [first, second] = of("sendMessage").map((c) => c.params);
    expect(first).toEqual({
      chat_id: GROUP_ID, text: "<b>On fees:</b> 1%", parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: KEYBOARD,
      reply_parameters: { message_id: 55, allow_sending_without_reply: true }, message_thread_id: 7,
    });
    expect(second).toEqual({ chat_id: GROUP_ID, text: "plain", parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    await out.typing(GROUP_ID, 7);
    await out.typing(GROUP_ID);
    expect(of("sendChatAction").map((c) => c.params)).toEqual([{ chat_id: GROUP_ID, action: "typing", message_thread_id: 7 }, { chat_id: GROUP_ID, action: "typing" }]);
  });

  it("edits a group's check on a queue of its own, never in its sends' way, and the admin chat's alerts on theirs; no keyboard removes the buttons", async () => {
    const { out, of, sender } = outBench();
    const check = out.edit(GROUP_ID, 701, "<b>2 left</b>", KEYBOARD);
    expect(sender.waiting(`${GROUP_ID}:edit`)).toBe(1);
    expect(sender.waiting(`${GROUP_ID}:check`)).toBe(0);
    expect(await check).toBe(true);
    const handled = out.edit(ADMIN_CHAT_ID, 9, "Handled by Alex");
    expect(sender.waiting(`${ADMIN_CHAT_ID}:alert`)).toBe(1);
    expect(await handled).toBe(true);
    expect(of("editMessageText").map((c) => c.params)).toEqual([
      { chat_id: GROUP_ID, message_id: 701, text: "<b>2 left</b>", parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: KEYBOARD },
      { chat_id: ADMIN_CHAT_ID, message_id: 9, text: "Handled by Alex", parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    ]);
  });

  it("sends a reply field (the private Ask prompt) when there are no buttons, and buttons when there are", async () => {
    const { out, of } = outBench();
    const field = { force_reply: true as const, input_field_placeholder: "Your question" };
    const sends = [
      out.send(PRIVATE_CHAT, "Ask me anything about tonkfun.fun.", { kind: "answer", forceReply: field }),
      out.send(PRIVATE_CHAT, "With a button", { kind: "answer", keyboard: KEYBOARD, forceReply: field }),
    ];
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all(sends);
    expect(of("sendMessage").map((c) => c.params.reply_markup)).toEqual([field, KEYBOARD]);
  });

  it("sends and edits nothing in the admin chat until it passed its checks", async () => {
    let ready = false;
    const { out, of } = outBench({ adminReady: () => ready });
    expect(await out.send(ADMIN_CHAT_ID, "An alert with a name", { kind: "alert" })).toBeNull();
    expect(await out.edit(ADMIN_CHAT_ID, 9, "Handled")).toBe(false);
    expect(await out.send(GROUP_ID, "A notice", { kind: "notice" })).not.toBeNull();
    expect(of("sendMessage").map((c) => c.params.chat_id)).toEqual([GROUP_ID]);
    ready = true;
    expect(await out.send(ADMIN_CHAT_ID, "An alert with a name", { kind: "alert" })).not.toBeNull();
    expect(of("editMessageText")).toEqual([]);
  });

  it("refuses what can't be sent without asking Telegram", async () => {
    const { out, calls } = outBench();
    expect(await out.send(0, "x", { kind: "answer" })).toBeNull();
    expect(await out.send(GROUP_ID, "", { kind: "answer" })).toBeNull();
    expect(await out.edit(GROUP_ID, 0, "x")).toBe(false);
    expect(await out.answerPress("")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("answers a press with a toast cut to Telegram's 200 characters, and reports a refusal as false", async () => {
    const { out, of } = outBench({ refuse: (_m, p) => (p.callback_query_id === "old" ? new TelegramError(400, "Bad Request: query is too old", null) : null) });
    expect(await out.answerPress("q1", "x".repeat(250))).toBe(true);
    expect(await out.answerPress("q2")).toBe(true);
    expect(await out.answerPress("old", "Done")).toBe(false);
    expect(of("answerCallbackQuery").map((c) => c.params)).toEqual([
      { callback_query_id: "q1", text: "x".repeat(200) },
      { callback_query_id: "q2" },
      { callback_query_id: "old", text: "Done" },
    ]);
  });
});

// The ephemeral copies' tests are in community-out-ephemeral.test.ts.

describe("createTelegramOut: each group's minute and its queues", () => {
  it("drops answers before notices, and a check waits for its slot instead of being dropped", async () => {
    const { out, of, calls } = outBench();
    const notice = (n: number) => out.send(GROUP_ID, `notice ${n}`, { kind: "notice" });
    // 14 notices, 3 seconds apart (the queue's gap): 14 of the minute's 20 sends.
    for (let n = 1; n <= 14; n += 1) {
      expect(await notice(n)).not.toBeNull();
      await vi.advanceTimersByTimeAsync(3_000);
    }
    expect(await out.send(GROUP_ID, "an answer", { kind: "answer" })).toBeNull();
    expect(out.room(GROUP_ID, "answer")).toBe(false);
    expect(out.room(GROUP_ID, "notice")).toBe(true);
    for (let n = 15; n <= 18; n += 1) {
      expect(await notice(n)).not.toBeNull();
      await vi.advanceTimersByTimeAsync(3_000);
    }
    expect(await notice(19)).toBeNull();
    expect(out.room(GROUP_ID, "notice")).toBe(false);

    // 54 seconds in: two checks fit in the minute, the third waits until its first send is a minute old.
    const checks = [1, 2, 3].map((n) => out.send(GROUP_ID, `check ${n}`, { kind: "check" }));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(texts(calls)).toEqual(expect.arrayContaining(["check 1", "check 2"]));
    expect(texts(calls)).not.toContain("check 3");
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await Promise.all(checks)).every((id) => id !== null)).toBe(true);
    expect(of("sendMessage").find((c) => c.params.text === "check 3")?.at).toBeGreaterThanOrEqual(NOW + 60_000);
    expect(texts(calls)).not.toContain("an answer");
    expect(texts(calls)).not.toContain("notice 19");
  });

  it("room() says whether the kind's queue and the group's minute have space", async () => {
    const { out, sender } = outBench();
    expect(out.room(GROUP_ID, "answer")).toBe(true);
    const answers = [1, 2, 3].map((n) => out.send(GROUP_ID, `answer ${n}`, { kind: "answer" }));
    expect(sender.waiting(`${GROUP_ID}:answer`)).toBe(3);
    expect(out.room(GROUP_ID, "answer")).toBe(false);
    expect(out.room(GROUP_ID, "notice")).toBe(true);
    expect(await out.send(GROUP_ID, "answer 4", { kind: "answer" })).toBeNull();
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await Promise.all(answers)).every((id) => id !== null)).toBe(true);
    expect(out.room(GROUP_ID, "answer")).toBe(true);

    // One person's private chat may have 10 answers waiting, and has no group minute.
    const replies = Array.from({ length: 10 }, (_, n) => out.send(PRIVATE_CHAT, `reply ${n}`, { kind: "answer" }));
    expect(out.room(PRIVATE_CHAT, "answer")).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await Promise.all(replies)).every((id) => id !== null)).toBe(true);
    expect(out.room(PRIVATE_CHAT, "answer")).toBe(true);
  });
});
