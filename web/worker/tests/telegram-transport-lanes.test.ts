import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotApi } from "../src/telegram/api";
import { Sender } from "../src/telegram/sender";

const T0 = 1_000_000;

/** A Bot API that answers at once and notes each call's method, its label and the (fake) time it went out. */
function recorder() {
  const sent: Array<{ method: string; label: string; at: number }> = [];
  const api: BotApi = {
    call: async <T>(method: string, params: Record<string, unknown>) => {
      sent.push({ method, label: String(params.label ?? ""), at: Date.now() });
      return true as T;
    },
  };
  return { api, sent };
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Sender: Telegram's 25 a second, by priority", () => {
  it("serves waiting calls by priority, first come first served within one, at most 25 a second", async () => {
    const { api, sent } = recorder();
    const sender = new Sender(api, () => undefined, () => Date.now());
    // 25 press answers take the first second; everything asked for after them waits for the next.
    const first = Array.from({ length: 25 }, (_, i) => sender.direct("answerCallbackQuery", { label: `press ${i}` }, { priority: "press" }));
    const later = [
      sender.direct("answerCallbackQuery", { label: "press late" }, { priority: "press" }),
      sender.direct("editMessageText", { label: "edit" }, { priority: "edit" }),
      sender.direct("getChatMember", { label: "verify" }, { priority: "verify" }),
      sender.direct("sendMessage", { label: "send" }, { priority: "send" }),
      sender.direct("getChatAdministrators", { label: "read" }, { priority: "read" }),
      sender.direct("restrictChatMember", { label: "act 1" }, { priority: "act" }),
      sender.direct("unbanChatMember", { label: "act 2" }, { priority: "act" }),
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.filter((c) => c.at === T0)).toHaveLength(25);
    await vi.advanceTimersByTimeAsync(2_000);
    await Promise.all([...first, ...later]);
    expect(sent.slice(25).map((c) => c.label)).toEqual(["act 1", "act 2", "read", "send", "verify", "edit", "press late"]);
    expect(sent.slice(25).every((c) => c.at >= T0 + 1_000)).toBe(true);
  });

  it("drops a call whose deadline passes while it waits, unsent, and counts it", async () => {
    const { api, sent } = recorder();
    const sender = new Sender(api, () => undefined, () => Date.now());
    // 150 moderation calls fill six seconds; a press answer allowed 5 seconds never goes out, one with no deadline does.
    const acts = Array.from({ length: 150 }, (_, i) => sender.direct("restrictChatMember", { label: `act ${i}` }, { priority: "act" }));
    const dropped = sender.direct("answerCallbackQuery", { label: "press" }, { priority: "press", maxWaitMs: 5_000 });
    const kept = sender.direct("answerCallbackQuery", { label: "press kept" }, { priority: "press" });
    await vi.advanceTimersByTimeAsync(8_000);
    await Promise.all(acts);
    expect(await dropped).toBeNull();
    expect(await kept).toBe(true);
    expect(sent.map((c) => c.label)).not.toContain("press");
    expect(sent.at(-1)?.label).toBe("press kept");
    expect(sender.stats.dropped).toBe(1);
  });
});
