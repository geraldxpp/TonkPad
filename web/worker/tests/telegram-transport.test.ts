import { describe, expect, it, vi } from "vitest";
import { type BotApi, botApi, TelegramError } from "../src/telegram/api";
import { Poller } from "../src/telegram/poller";
import { Sender } from "../src/telegram/sender";
import type { TgUpdate } from "../src/telegram/types";

/** A clock that only moves when the code under test sleeps. */
function fakeTime() {
  let now = 1_000_000;
  return { now: () => now, sleep: async (ms: number) => void (now += ms) };
}

function scripted(answers: Array<unknown | Error>): BotApi & { calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      calls.push([method, params]);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next as T;
    },
  };
}

describe("botApi", () => {
  it("posts JSON to the method and returns its result", async () => {
    let asked = "";
    const fetchFn = async (url: RequestInfo | URL) => {
      asked = String(url);
      return new Response(JSON.stringify({ ok: true, result: { id: 1 } }), { status: 200 });
    };
    const api = botApi("123456:SECRET", fetchFn);
    await expect(api.call("getMe", {})).resolves.toEqual({ id: 1 });
    expect(asked).toBe("https://api.telegram.org/bot123456:SECRET/getMe");
  });

  it("fails with Telegram's own words and retry_after, never the token", async () => {
    const api = botApi("123456:SECRET", async () => new Response(JSON.stringify({ ok: false, description: "Too Many Requests: retry after 3", parameters: { retry_after: 3 } }), { status: 429 }));
    const error = await api.call("sendMessage", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TelegramError);
    expect((error as TelegramError).retryAfter).toBe(3);
    expect((error as Error).message).not.toContain("SECRET");
    const offline = botApi("123456:SECRET", async () => Promise.reject(new TypeError("fetch failed https://api.telegram.org/bot123456:SECRET")));
    const down = await offline.call("getMe", {}).catch((e: unknown) => e);
    expect((down as TelegramError).status).toBe(0);
    expect((down as Error).message).not.toContain("SECRET");
  });
});

describe("Sender", () => {
  it("waits Telegram's retry_after on a 429, then sends", async () => {
    const t = fakeTime();
    const api = scripted([new TelegramError(429, "Too Many Requests", 5), { message_id: 1 }]);
    const sender = new Sender(api, () => {}, t.now, t.sleep);
    const start = t.now();
    await expect(sender.toChat("1", 1_000, "sendMessage", {})).resolves.toEqual({ message_id: 1 });
    expect(t.now() - start).toBeGreaterThanOrEqual(5_000);
  });

  it("drops a refused message, counts it, and stays quiet about harmless ones", async () => {
    const t = fakeTime();
    const log = vi.fn();
    const api = scripted([new TelegramError(403, "Forbidden: bot was blocked by the user", null), new TelegramError(400, "Bad Request: message is not modified", null)]);
    const sender = new Sender(api, log, t.now, t.sleep);
    expect(await sender.toChat("1", 0, "sendMessage", {})).toBeNull();
    expect(await sender.toChat("1", 0, "editMessageText", {})).toBeNull();
    expect(sender.stats.failed).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("drops a reply at once when its chat already has enough waiting", async () => {
    const t = fakeTime();
    const api: BotApi = { call: async <T>() => true as T };
    const sender = new Sender(api, () => {}, t.now, t.sleep);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => sender.toChat("g", 3_000, "sendMessage", {}, { maxQueued: 3 })));
    expect(results).toEqual([true, true, true, null, null]);
    expect(sender.stats.dropped).toBe(2);
  });

  it("never sends a new message twice after a connection failure, but retries an edit", async () => {
    const t = fakeTime();
    const api = scripted([new TelegramError(0, "", null), new TelegramError(0, "", null), true]);
    const sender = new Sender(api, () => {}, t.now, t.sleep);
    expect(await sender.toChat("1", 0, "sendMessage", {})).toBeNull();
    expect(await sender.toChat("1", 0, "editMessageText", {})).toBe(true);
    expect(api.calls.map(([m]) => m)).toEqual(["sendMessage", "editMessageText", "editMessageText"]);
  });

  it("forgets a chat once the longest gap has passed since its last reply", async () => {
    const t = fakeTime();
    const api: BotApi = { call: async <T>() => true as T };
    const sender = new Sender(api, () => {}, t.now, t.sleep);
    await sender.toChat("42", 1_000, "sendMessage", {});
    const internals = sender as unknown as { lastAt: Map<string, number> };
    expect(internals.lastAt.has("42")).toBe(true);
    sender.forget(t.now() + 2_999);
    expect(internals.lastAt.has("42")).toBe(true);
    sender.forget(t.now() + 3_000);
    expect(internals.lastAt.has("42")).toBe(false);
  });

  it("drops a reply that couldn't go out within its time, queue and Telegram's waits included", async () => {
    const t = fakeTime();
    const api = scripted([true, new TelegramError(429, "Too Many Requests", 30)]);
    const sender = new Sender(api, () => {}, t.now, t.sleep);
    const limits = { maxWaitMs: 20_000 };
    expect(await sender.toChat("g", 25_000, "sendMessage", {}, limits)).toBe(true);
    // The next reply would wait 25 s for the gap: past its 20 s, so it is dropped without being sent.
    expect(await sender.toChat("g", 25_000, "sendMessage", {}, limits)).toBeNull();
    // A 429 asking for 30 s more is past the deadline too.
    expect(await sender.toChat("h", 0, "sendMessage", {}, limits)).toBeNull();
    expect(sender.stats.dropped).toBe(2);
    expect(api.calls).toHaveLength(2);
  });

  it("keeps a gap between two messages to the same chat", async () => {
    const t = fakeTime();
    const sent: Array<[string, number]> = [];
    const api: BotApi = { call: async <T>(method: string, params: Record<string, unknown>) => (sent.push([String(params.k), t.now()]), true as T) };
    const sender = new Sender(api, () => {}, t.now, t.sleep);
    await Promise.all([sender.toChat("g", 3_000, "sendMessage", { k: "g1" }), sender.toChat("g", 3_000, "sendMessage", { k: "g2" }), sender.toChat("other", 3_000, "sendMessage", { k: "o" })]);
    const at = Object.fromEntries(sent);
    expect(at.g2 - at.g1).toBeGreaterThanOrEqual(3_000);
    expect(at.o - at.g1).toBeLessThan(3_000);
  });
});

describe("Poller", () => {
  it("hands each update over once, confirming it with the next offset", async () => {
    const seen: number[] = [];
    const api = scripted([[{ update_id: 10 }, { update_id: 11 }], []]);
    const poller = new Poller(api, async (u: TgUpdate) => void seen.push(u.update_id), () => {}, async () => {});
    const call = api.call.bind(api);
    api.call = async <T>(method: string, params: Record<string, unknown>) => {
      if (api.calls.length === 2) poller.stop();
      return call<T>(method, params);
    };
    await poller.run();
    expect(seen).toEqual([10, 11]);
    expect(api.calls[1][1].offset).toBe(12);
  });

  it("removes a webhook on a 409 about it, and stops for a refused token", async () => {
    const log = vi.fn();
    const api = scripted([new TelegramError(409, "Conflict: can't use getUpdates method while webhook is active", null), true, new TelegramError(401, "Unauthorized", null)]);
    const poller = new Poller(api, async () => {}, log, async () => {});
    await poller.run();
    expect(api.calls.map(([m]) => m)).toEqual(["getUpdates", "deleteWebhook", "getUpdates"]);
    expect(poller.health.state).toBe("unauthorized");
  });

  it("backs off after a network failure and carries on", async () => {
    const waits: number[] = [];
    const api = scripted([new TelegramError(0, "", null), new TelegramError(0, "", null), new TelegramError(401, "Unauthorized", null)]);
    const poller = new Poller(api, async () => {}, () => {}, async (ms) => void waits.push(ms));
    await poller.run();
    expect(waits).toEqual([1_000, 2_000]);
  });

  it("asks Telegram for edits, membership changes and chosen inline results too", async () => {
    const api = scripted([new TelegramError(401, "Unauthorized", null)]);
    await new Poller(api, async () => {}, () => {}, async () => {}).run();
    expect(api.calls[0][1].allowed_updates).toEqual(["message", "edited_message", "callback_query", "inline_query", "chosen_inline_result", "chat_member", "my_chat_member"]);
  });
});

