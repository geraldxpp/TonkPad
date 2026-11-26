// @vitest-environment node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenStore } from "../src/store";
import { startTelegram, type TelegramBot } from "../src/telegram";
import { waitsForSlot } from "../src/telegram/router";
import type { TgUpdate } from "../src/telegram/types";
import { fakeClaude, GROUP_ID, groupMessage } from "./community-fixtures";
import { fakeTelegram, KEY, profileCallsOf, TOKEN, update } from "./telegram-bot-fixtures";
import { stubHooks } from "./telegram-fixtures";

/**
 * Inline feedback as the bot sets it at start, where it sets its profile
 * (index.ts, index-profile.ts, profile-settings.ts): every chosen result
 * while the community agent's AI answers, none without it, and a refusal
 * that changes nothing else. And a chosen result when the bot is busy: it
 * waits for a slot while the agent runs, as the Ask post it pairs with does.
 */

const ON = { inline_feedback_share_denominator: 1, inline_query_placeholder: "Token address or a question" };
const OFF = { inline_feedback_share_denominator: 0 };
const AGENT = { TELEGRAM_BOT_TOKEN: TOKEN, ANTHROPIC_API_KEY: KEY };
const ALONE = { TELEGRAM_BOT_TOKEN: TOKEN };

type Telegram = ReturnType<typeof fakeTelegram>;
const settingsOf = (t: Telegram) => t.calls.filter((c) => c.method === "setMySettings").map((c) => c.body);
const chosenAsk = (id: number): TgUpdate => ({ update_id: id, chosen_inline_result: { result_id: "ask:p", from: { id: 2_000, language_code: "en" }, query: "how do creator locks work?" } });
const inlineQuery = (id: number): TgUpdate => ({ update_id: id, inline_query: { id: `q${id}`, from: { id: 11, language_code: "en" }, query: "how do creator locks work?", chat_type: "sender" } });

let bot: TelegramBot | null = null;
let release = (): void => undefined;
afterEach(() => {
  release();
  bot?.stop();
});

/** The bot with this environment over a stand-in Telegram, Anthropic faked (no model call is made here), its log lines kept. */
async function start(env: Record<string, string>, telegram: Telegram, lines: string[] = []): Promise<TelegramBot | null> {
  const dir = await mkdtemp(join(tmpdir(), "tonk-bot-"));
  bot = await startTelegram({ store: new TokenStore(), env, snapshotPath: join(dir, "snapshot.json"), tonkFeed: false, log: (l) => void lines.push(l), fetchFn: telegram.fetchFn, ethUsd: () => 3_000, claude: fakeClaude([]) });
  return bot;
}

describe("inline feedback, set by the bot where it sets its profile", () => {
  it("asks for every chosen result, with the placeholder, while the community agent's AI answers, first of all; /health says on", async () => {
    const telegram = fakeTelegram([]);
    await start(AGENT, telegram);
    expect(bot?.health().inlineFeedback).toBeNull();
    await vi.waitFor(() => expect(bot?.health().inlineFeedback).toBe("on"), { timeout: 3_000 });
    expect(settingsOf(telegram)).toEqual([ON]);
    await vi.waitFor(() => expect(profileCallsOf(telegram.calls)).toHaveLength(49), { timeout: 3_000 });
    expect(telegram.calls.findIndex((c) => c.method === "setMySettings")).toBeLessThan(telegram.calls.findIndex((c) => c.method === "setMyCommands"));
  });

  it("asks for none without the agent, leaving the placeholder and inline mode as they are; /health says off", async () => {
    const telegram = fakeTelegram([]);
    await start(ALONE, telegram);
    await vi.waitFor(() => expect(bot?.health().inlineFeedback).toBe("off"), { timeout: 3_000 });
    expect(settingsOf(telegram)).toEqual([OFF]);
    expect(JSON.stringify(telegram.calls)).not.toContain("supports_inline_queries");
  });

  it("logs one line naming the error when Telegram refuses it, and keeps running and offering Ask; /health says failed", async () => {
    const batches: TgUpdate[][] = [];
    const telegram = fakeTelegram(batches, { setMySettings: "Bad Request: method not found" });
    const lines: string[] = [];
    await start(AGENT, telegram, lines);
    await vi.waitFor(() => expect(bot?.health().inlineFeedback).toBe("failed"), { timeout: 3_000 });
    expect(lines.filter((l) => /setMySettings|inline feedback/.test(l))).toEqual([
      "inline feedback: setMySettings failed (TelegramError); turn it on with /setinlinefeedback in @BotFather",
    ]);
    await vi.waitFor(() => expect(profileCallsOf(telegram.calls)).toHaveLength(49), { timeout: 3_000 });
    batches.push([update(1, 11, "/start"), inlineQuery(2)]);
    await vi.waitFor(() => expect(telegram.calls.filter((c) => ["sendMessage", "answerInlineQuery"].includes(c.method))).toHaveLength(2), { timeout: 3_000 });
    const answered = telegram.calls.find((c) => c.method === "answerInlineQuery")?.body.results as Array<{ id: string }>;
    expect(answered.map((r) => r.id)).toEqual(["ask:p"]);
    expect(bot?.health()).toMatchObject({ polling: "ok", community: { enabled: true }, inlineFeedback: "failed" });
  });
});

describe("a chosen inline result while the bot is busy (index.ts, router.ts waitsForSlot)", () => {
  /** 100 private chats' /start, whose replies Telegram holds, so 100 updates are in flight; then a chosen Ask result and an inline query. What was confirmed unanswered. */
  async function busy(env: Record<string, string>): Promise<number | undefined> {
    const held = new Promise<void>((resolve) => (release = resolve));
    const batches: TgUpdate[][] = [];
    const telegram = fakeTelegram(batches, {}, { sendMessage: held });
    await start(env, telegram);
    // The profile's sync starts once the agent, if any, is in place.
    await vi.waitFor(() => expect(settingsOf(telegram)).toHaveLength(1), { timeout: 3_000 });
    batches.push([...Array.from({ length: 100 }, (_, i) => update(1 + i, 1_000 + i, "/start")), chosenAsk(101), inlineQuery(102)]);
    await vi.waitFor(() => expect(bot?.health().updates).toBe(102), { timeout: 3_000 });
    return (bot?.health().dropped as { updates?: number } | undefined)?.updates;
  }

  it("waits for a slot while the community agent runs, as its post does: only the inline query is confirmed unanswered", async () => {
    expect(await busy(AGENT)).toBe(1);
  });

  it("is confirmed unanswered like the rest without the agent", async () => {
    expect(await busy(ALONE)).toBe(2);
  });

  it("is a priority update only while the agent runs; the agent's own chats' updates are too, an inline query never", () => {
    const community = stubHooks({ groups: [GROUP_ID] });
    const group: TgUpdate = { update_id: 1, message: groupMessage("gm") };
    for (const [u, withAgent] of [[chosenAsk(2), true], [group, true], [inlineQuery(3), false], [update(4, 11, "hi"), false]] as const) {
      expect(waitsForSlot(u, { community }), JSON.stringify(u).slice(0, 40)).toBe(withAgent);
      expect(waitsForSlot(u, {}), JSON.stringify(u).slice(0, 40)).toBe(false);
    }
  });
});
