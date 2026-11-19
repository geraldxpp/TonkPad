import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenStore } from "../src/store";
import { startTelegram, type TelegramBot } from "../src/telegram";
import type { TgUpdate } from "../src/telegram/types";
import { launch, WHOA } from "./telegram-fixtures";

const TOKEN = `123456789:${"S".repeat(35)}`;

/** A stand-in for Telegram's Bot API: a scripted queue of updates, every call recorded. */
function fakeTelegram(batches: TgUpdate[][]) {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = String(input).split("/").pop() ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ method, body });
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

const update = (id: number, chat: number, text: string): TgUpdate => ({
  update_id: id,
  message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat, language_code: "en" }, text },
});

describe("the bot inside the worker", () => {
  let bot: TelegramBot | null = null;
  afterEach(() => bot?.stop());

  it("stays off without a token", async () => {
    const log = vi.fn();
    expect(await startTelegram({ store: new TokenStore(), env: {}, snapshotPath: "/tmp/x/snapshot.json", tonkFeed: true, log })).toBeNull();
    expect(log).toHaveBeenCalledWith("off: TELEGRAM_BOT_TOKEN isn't set");
  });

  it("signs in, sets its profile once, and answers people from the worker's own tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tonk-bot-"));
    const store = new TokenStore();
    store.add(launch(WHOA));
    const telegram = fakeTelegram([[update(1, 11, "/start"), update(2, 22, `check ${WHOA}`)]]);
    const lines: string[] = [];
    bot = await startTelegram({ store, env: { TELEGRAM_BOT_TOKEN: TOKEN }, snapshotPath: join(dir, "snapshot.json"), tonkFeed: false, log: (l) => lines.push(l), fetchFn: telegram.fetchFn });
    expect(bot).not.toBeNull();

    await vi.waitFor(() => expect(telegram.calls.filter((c) => c.method === "sendMessage")).toHaveLength(2), { timeout: 3_000 });
    await vi.waitFor(() => expect(telegram.calls.filter((c) => c.method.startsWith("setMy") || c.method === "setChatMenuButton")).toHaveLength(49), { timeout: 3_000 });
    expect(telegram.calls[0].method).toBe("getMe");

    const [home, card] = telegram.calls.filter((c) => c.method === "sendMessage").map((c) => c.body);
    expect(home.chat_id).toBe(11);
    expect(home.parse_mode).toBe("HTML");
    expect(JSON.stringify(home.reply_markup)).toContain('"callback_data":"check"');
    expect(card.chat_id).toBe(22);
    expect(String(card.text)).toContain("<b>Whoa the Tarsier</b> · WHOA");
    expect(card.link_preview_options).toEqual({ is_disabled: true });

    expect(bot?.health()).toMatchObject({ enabled: true, polling: "ok", bot: "tonkfun_bot", inline: true, dropped: { replies: 0, updates: 0 }, channel: { enabled: false } });
    await vi.waitFor(async () => {
      await bot?.save();
      const saved = JSON.parse(await readFile(join(dir, "telegram.json"), "utf8")) as { profileHash: string };
      expect(saved.profileHash).toMatch(/^[0-9a-f]{64}$/);
    });
    expect(lines.join("\n")).not.toContain(TOKEN);
  });
});
