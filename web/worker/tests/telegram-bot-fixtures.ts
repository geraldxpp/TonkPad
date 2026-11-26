import type { TgUpdate } from "../src/telegram/types";

/** The whole bot's tests (telegram-bot*.test.ts): a bot token, an Anthropic key, Telegram's Bot API stood in for, and a private chat's message. */

export const TOKEN = `123456789:${"S".repeat(35)}`;
export const KEY = `sk-ant-api03-${"k".repeat(40)}`;

/**
 * A stand-in for Telegram's Bot API: a scripted queue of updates, every call
 * recorded; `fail` answers a method with a 400 and that description; `slow`
 * holds a method's answer until its promise settles; `answers` gives a
 * method's result from the call's body.
 */
export function fakeTelegram(batches: TgUpdate[][], fail: Record<string, string> = {}, slow: Record<string, Promise<unknown>> = {}, answers: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = String(input).split("/").pop() ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ method, body });
    await slow[method];
    if (fail[method]) return new Response(JSON.stringify({ ok: false, description: fail[method] }), { status: 400 });
    const answer = answers[method];
    if (answer) return ok(answer(body));
    if (method === "getMe") return ok({ id: 1, is_bot: true, username: "tonkfun_bot", supports_inline_queries: true });
    if (method === "getUpdates") {
      const batch = batches.shift();
      if (!batch) await new Promise((resolve) => setTimeout(resolve, 20));
      return ok(batch ?? []);
    }
    return ok(method === "sendMessage" ? { message_id: calls.length } : true);
  };
  return { calls, fetchFn };
}

/** What the bot sets about itself through the profile (index-profile.ts): commands, descriptions and the menu button; inline feedback's setMySettings apart. */
export const profileCallsOf = <T extends { method: string }>(calls: readonly T[]): T[] =>
  calls.filter((c) => (c.method.startsWith("setMy") && c.method !== "setMySettings") || c.method === "setChatMenuButton");

/** A message from `chat` in its private chat with the bot. */
export const update = (id: number, chat: number, text: string): TgUpdate => ({
  update_id: id,
  message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat, language_code: "en" }, text },
});

