// @vitest-environment node
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenStore } from "../src/store";
import { startTelegram, type TelegramBot } from "../src/telegram";
import { en } from "../src/telegram/i18n/en";
import type { BotCommand, TgUpdate } from "../src/telegram/types";
import { askLine } from "../src/telegram/views";
import { fakeClaude } from "./community-fixtures";
import { fakeTelegram, KEY, profileCallsOf, TOKEN, update } from "./telegram-bot-fixtures";
import { launch, WHOA } from "./telegram-fixtures";

const COMMUNITY_GROUP = -1_001_234_567_890;
const groupUpdate = (id: number, text: string): TgUpdate => ({
  update_id: id,
  message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: COMMUNITY_GROUP, type: "supergroup" }, from: { id: 4_242, language_code: "en" }, text },
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
    await vi.waitFor(() => expect(profileCallsOf(telegram.calls)).toHaveLength(49), { timeout: 3_000 });
    expect(telegram.calls[0].method).toBe("getMe");

    const [home, card] = telegram.calls.filter((c) => c.method === "sendMessage").map((c) => c.body);
    expect(home.chat_id).toBe(11);
    expect(home.parse_mode).toBe("HTML");
    expect(JSON.stringify(home.reply_markup)).toContain('"callback_data":"check"');
    expect(card.chat_id).toBe(22);
    expect(String(card.text)).toContain("<b>Whoa the Tarsier</b> · WHOA");
    expect(card.link_preview_options).toEqual({ is_disabled: true });

    expect(bot?.health()).toMatchObject({ enabled: true, polling: "ok", bot: "tonkfun_bot", inline: true, dropped: { replies: 0, updates: 0 }, channel: { enabled: false }, community: { enabled: false } });
    // Without the community agent, module 14's own descriptions: nothing says AI.
    const description = telegram.calls.find((c) => c.method === "setMyDescription" && !("language_code" in c.body))?.body.description;
    expect(description).toBe(en.profile.description);
    expect(lines).toContain("community off: neither TELEGRAM_COMMUNITY_CHATS nor ANTHROPIC_API_KEY is set");
    await vi.waitFor(async () => {
      await bot?.save();
      const saved = JSON.parse(await readFile(join(dir, "telegram.json"), "utf8")) as { profileHash: string };
      expect(saved.profileHash).toMatch(/^[0-9a-f]{64}$/);
    });
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("starts the community agent with Anthropic's key, offers /ask, and never logs the key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tonk-bot-"));
    const batches: TgUpdate[][] = [];
    const telegram = fakeTelegram(batches, { setMyDescription: `Bad Request: description rejected near ${KEY}` });
    const claude = fakeClaude([]);
    const lines: string[] = [];
    const env = { TELEGRAM_BOT_TOKEN: TOKEN, ANTHROPIC_API_KEY: ` ${KEY} ` };
    bot = await startTelegram({ store: new TokenStore(), env, snapshotPath: join(dir, "snapshot.json"), tonkFeed: false, log: (l) => lines.push(l), fetchFn: telegram.fetchFn, ethUsd: () => 3_000, claude });

    await vi.waitFor(() => expect(profileCallsOf(telegram.calls)).toHaveLength(49), { timeout: 3_000 });
    // Polling runs while the agent starts (module 14 answers at once); once it is in place, /start offers Ask.
    batches.push([update(1, 11, "/start")]);
    await vi.waitFor(() => expect(telegram.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1), { timeout: 3_000 });
    const menu = telegram.calls.find((c) => c.method === "setMyCommands" && JSON.stringify(c.body.scope) === '{"type":"all_private_chats"}' && !("language_code" in c.body));
    expect((menu?.body.commands as BotCommand[]).map((c) => c.command)).toEqual(["start", "ask", "check", "launches", "referral", "help"]);
    const home = telegram.calls.find((c) => c.method === "sendMessage")?.body;
    expect(JSON.stringify(home?.reply_markup)).toContain('"callback_data":"askp"');
    expect(bot?.health()).toMatchObject({ community: { enabled: true } });
    // AI can answer in private chats: the descriptions say so, naming Claude and Anthropic.
    const description = String(telegram.calls.find((c) => c.method === "setMyDescription" && !("language_code" in c.body))?.body.description);
    expect(description).toBe(en.profile.descriptionAi);
    expect(String(telegram.calls.find((c) => c.method === "setMyShortDescription" && !("language_code" in c.body))?.body.short_description)).toBe(en.profile.shortAi);
    expect(claude.calls).toEqual([]);
    await vi.waitFor(() => expect(lines.some((l) => l.includes("setMyDescription failed") && l.includes("(hidden)"))).toBe(true));
    expect(lines.join("\n")).not.toContain(KEY);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("answers at once while the community agent starts slowly, and hands it the community group's updates once it is ready (wiring#7)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tonk-bot-"));
    let ready = () => undefined as void;
    const admins = new Promise<void>((resolve) => (ready = resolve));
    const ADMIN_CHAT = -1_009_876_543_210;
    const OWNER = 7_001;
    const person = (id: number) => ({ id, is_bot: id === 1, first_name: "Someone" });
    // Telegram as the community is set up, so no setup read waits to be tried again; only the admin lists are slow.
    const answers = {
      getChat: (b: Record<string, unknown>) => (b.chat_id === ADMIN_CHAT ? { id: ADMIN_CHAT, type: "supergroup", title: "Team", message_auto_delete_time: 604_800 } : { id: b.chat_id, type: "supergroup", title: "tonkfun.fun community" }),
      getChatMember: (b: Record<string, unknown>) =>
        b.user_id === 1 ? { status: "administrator", can_delete_messages: true, can_restrict_members: true, user: person(1) }
        : b.user_id === OWNER ? { status: b.chat_id === ADMIN_CHAT ? "member" : "creator", user: person(OWNER) }
        : { status: "member", user: person(Number(b.user_id)) },
      getChatAdministrators: () => [{ status: "creator", user: person(OWNER) }, { status: "administrator", can_delete_messages: true, can_restrict_members: true, user: person(1) }],
    };
    const telegram = fakeTelegram([[update(1, 11, "/start"), groupUpdate(2, "/help")]], {}, { getChatAdministrators: admins }, answers);
    const lines: string[] = [];
    const env = { TELEGRAM_BOT_TOKEN: TOKEN, ANTHROPIC_API_KEY: KEY, TELEGRAM_COMMUNITY_CHATS: String(COMMUNITY_GROUP), TELEGRAM_ADMIN_CHAT_ID: String(ADMIN_CHAT), TELEGRAM_OWNER_IDS: String(OWNER) };
    bot = await startTelegram({ store: new TokenStore(), env, snapshotPath: join(dir, "snapshot.json"), tonkFeed: false, log: (l) => lines.push(l), fetchFn: telegram.fetchFn, ethUsd: () => 3_000, claude: fakeClaude([]) });
    const sent = (chat: number) => telegram.calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === chat);
    // Module 14 answers the private chat while the agent is still reading the admin lists; the group's update waits for it.
    await vi.waitFor(() => expect(sent(11)).toHaveLength(1), { timeout: 3_000 });
    await vi.waitFor(() => expect(telegram.calls.some((c) => c.method === "getChatAdministrators")).toBe(true), { timeout: 3_000 });
    expect(sent(COMMUNITY_GROUP)).toEqual([]);
    expect(bot?.health()).toMatchObject({ community: { enabled: false } });
    ready();
    await vi.waitFor(() => expect(sent(COMMUNITY_GROUP)).toHaveLength(1), { timeout: 3_000 });
    expect(bot?.health()).toMatchObject({ community: { enabled: true } });
    // The agent's own group: /help there says how to ask the AI.
    expect(String(sent(COMMUNITY_GROUP)[0].body.text)).toContain(askLine("en", true, "tonkfun_bot"));
  });
});
