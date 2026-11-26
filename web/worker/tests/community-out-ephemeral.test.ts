import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramError } from "../src/telegram/api";
import { GROUP_ID } from "./community-fixtures";
import { outBench } from "./community-out-fixtures";
import { NOW } from "./fixtures";

const KEYBOARD = { inline_keyboard: [[{ text: "Why? Ask for a review", url: "https://t.me/TonkfunBot?start=appeal" }]] };
const PRIVATE_CHAT = 4_242;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createTelegramOut: ephemeral copies", () => {
  const refuseCopies = (_m: string, p: Record<string, unknown>) => (p.ephemeral_message_parameters ? new TelegramError(400, "Bad Request: can't send an ephemeral message here", null) : null);

  it("sends the member a copy only they see, and a refused copy changes nothing", async () => {
    const { out, of } = outBench({ refuse: refuseCopies });
    expect(await out.send(GROUP_ID, "A link was removed.", { kind: "notice", replyTo: 9, thread: 3, keyboard: KEYBOARD, ephemeralTo: 101 })).toBe(701);
    await vi.advanceTimersByTimeAsync(0);
    const [notice, copy] = of("sendMessage").map((c) => c.params);
    expect(notice).not.toHaveProperty("ephemeral_message_parameters");
    expect(copy).toEqual({ ...notice, ephemeral_message_parameters: { receiver_user_id: 101 } });
    // In a private chat the message is already the member's alone.
    expect(await out.send(PRIVATE_CHAT, "Only for you", { kind: "answer", ephemeralTo: PRIVATE_CHAT })).toBe(702);
    expect(of("sendMessage")).toHaveLength(3);
  });

  it("sends only the member's copy with ephemeralOnly: nothing public goes out, and the send resolves null", async () => {
    const { out, of } = outBench();
    const html = "I'm sorry you're going through this.";
    expect(await out.send(GROUP_ID, html, { kind: "notice", thread: 3, keyboard: KEYBOARD, ephemeralTo: 101, ephemeralOnly: true })).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(of("sendMessage").map((c) => c.params)).toEqual([{
      chat_id: GROUP_ID, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: KEYBOARD, message_thread_id: 3,
      ephemeral_message_parameters: { receiver_user_id: 101 },
    }]);
  });

  it("pauses the copies for an hour after three refusals in a row, with one log line", async () => {
    const { out, of, lines } = outBench({ refuse: refuseCopies });
    for (let n = 1; n <= 4; n += 1) {
      expect(await out.send(GROUP_ID, `note ${n}`, { kind: "notice", ephemeralTo: 101 })).not.toBeNull();
      await vi.advanceTimersByTimeAsync(3_000);
    }
    expect(of("sendMessage").filter((c) => c.params.ephemeral_message_parameters)).toHaveLength(3);
    expect(lines.filter((line) => line.includes("paused for an hour"))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await out.send(GROUP_ID, "note 5", { kind: "notice", ephemeralTo: 101 });
    await vi.advanceTimersByTimeAsync(0);
    expect(of("sendMessage").filter((c) => c.params.ephemeral_message_parameters)).toHaveLength(4);
  });
});
