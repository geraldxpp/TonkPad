import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shared/i18n/config";
import { loadTelegramConfig } from "../src/telegram/config";
import { BOT_DICTIONARIES, botLocale } from "../src/telegram/i18n";
import { COMMUNITY_DICTIONARIES } from "../src/telegram/i18n/community";
import { en } from "../src/telegram/i18n/en";
import { type Call, profileCalls, profileHash, type ProfileOptions } from "../src/telegram/profile";
import { Sender } from "../src/telegram/sender";
import type { BotCommand } from "../src/telegram/types";
import { profileOptions, selfOf, wireCommunity } from "../src/telegram/wire";
import { TokenStore } from "../src/store";
import { stubHooks } from "./telegram-fixtures";

const TOKEN = `123456789:${"A".repeat(35)}`;

/** Every leaf as [path, value]. */
function leaves(node: object, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const BUTTONS = ["inline.notFound", "home.ask", "home.check", "home.launches", "home.referral", "home.help", "home.open", "card.open", "card.refresh", "card.share", "launches.trending", "launches.explore", "referral.share", "referral.open", "help.docs", "common.back", "check.lookUp", "inline.help", "inline.askNo"];

describe("the bot's words", () => {
  const english = new Map(leaves(en));

  it.each(LOCALES.map((l) => l.code))("%s has the English keys and placeholders, and nothing empty", (code) => {
    const words = leaves(BOT_DICTIONARIES[code]);
    expect(words.map(([path]) => path).sort()).toEqual([...english.keys()].sort());
    for (const [path, value] of words) {
      expect(value.trim(), `${code} ${path}`).not.toBe("");
      expect(placeholders(value), `${code} ${path}`).toEqual(placeholders(english.get(path) ?? ""));
    }
  });

  it.each(LOCALES.map((l) => l.code))("%s fits Telegram's limits and adds no live entities", (code) => {
    const d = BOT_DICTIONARIES[code];
    expect(d.profile.short.length).toBeLessThanOrEqual(120);
    expect(d.profile.description.length).toBeLessThanOrEqual(512);
    for (const value of Object.values(d.commands)) expect(value.length).toBeLessThanOrEqual(256);
    const words = new Map(leaves(d));
    for (const path of BUTTONS) expect([...(words.get(path) ?? "")].length, `${code} ${path}`).toBeLessThanOrEqual(30);
    for (const [path, value] of words) {
      // The bot's own commands may be named (/ask on inline.askNo, a button label, which Telegram never parses for entities).
      const rest = value.replace(/\/(check|launches|referral|ask)\b/g, "").replace("@{bot}", "");
      expect(rest, `${code} ${path}`).not.toMatch(/[@#$\\]|\/(?!\s)/);
    }
  });

  it("is translated, not English with another label", () => {
    for (const { code } of LOCALES) if (code !== "en") expect(BOT_DICTIONARIES[code].home.body, code).not.toBe(en.home.body);
  });

  it("follows the Telegram app's language", () => {
    expect([botLocale("pt-br"), botLocale("zh-hans"), botLocale("in"), botLocale("EN"), botLocale("xx"), botLocale(undefined)]).toEqual(["pt", "zh", "id", "en", "en", "en"]);
  });

  it("sets the commands, descriptions and menu button in every language", () => {
    const calls = profileCalls();
    expect(calls).toHaveLength(LOCALES.length * 4 + 1);
    const english = calls.filter(([, p]) => !("language_code" in p));
    expect(english.map(([m]) => m)).toEqual(["setMyCommands", "setMyCommands", "setMyDescription", "setMyShortDescription", "setChatMenuButton"]);
    expect(profileHash(calls, 1)).not.toBe(profileHash(calls, 2));
  });
});

describe("the profile with the community agent", () => {
  const GROUP = -1001234567890;
  const ADMIN_CHAT = -1009876543210;
  const FULL: ProfileOptions = { privateAi: true, reports: true, communityChats: [GROUP], adminChat: ADMIN_CHAT, ai: true };
  const NONE: ProfileOptions = { privateAi: false, reports: false, communityChats: [], adminChat: null, ai: false };
  const commandsFor = (calls: Call[], scope: Record<string, unknown>, lang?: string) =>
    calls.find(([m, p]) => m === "setMyCommands" && JSON.stringify(p.scope) === JSON.stringify(scope) && p.language_code === lang)?.[1].commands as BotCommand[] | undefined;
  const names = (commands: BotCommand[] | undefined) => (commands ?? []).map((c) => c.command);

  it("adds a menu for each community group's members and admins, and one for the admin chat, in every language", () => {
    expect(profileCalls(NONE)).toEqual(profileCalls());
    const calls = profileCalls(FULL);
    expect(calls).toHaveLength(LOCALES.length * 7 + 1);
    expect(names(commandsFor(calls, { type: "all_private_chats" }))).toEqual(["start", "ask", "check", "launches", "referral", "report", "help"]);
    expect(names(commandsFor(calls, { type: "all_group_chats" }))).toEqual(["check", "help"]);
    expect(names(commandsFor(calls, { type: "chat", chat_id: GROUP }))).toEqual(["ask", "check", "rules", "report", "help"]);
    expect(names(commandsFor(calls, { type: "chat_administrators", chat_id: GROUP }))).toEqual([
      "ask", "check", "rules", "report", "help", "status", "pause", "resume", "proactive", "strict", "raid", "trust", "untrust", "trusted", "forget", "mod",
    ]);
    expect(names(commandsFor(calls, { type: "chat", chat_id: ADMIN_CHAT }))).toEqual(["mod", "status", "forget", "ai"]);
    expect(names(commandsFor(profileCalls({ ...NONE, privateAi: true }), { type: "all_private_chats" }))).toEqual(["start", "ask", "check", "launches", "referral", "help"]);
  });

  it("describes each command in the person's language, from the bot's and the community's words, within 256 characters", () => {
    const calls = profileCalls(FULL);
    const german = commandsFor(calls, { type: "chat_administrators", chat_id: GROUP }, "de") ?? [];
    expect(german.find((c) => c.command === "ask")?.description).toBe(COMMUNITY_DICTIONARIES.de.commands.ask);
    expect(german.find((c) => c.command === "check")?.description).toBe(BOT_DICTIONARIES.de.commands.check);
    expect(commandsFor(calls, { type: "chat", chat_id: ADMIN_CHAT })?.find((c) => c.command === "ai")?.description).toBe(COMMUNITY_DICTIONARIES.en.commands.ai);
    for (const [method, params] of calls) {
      if (method !== "setMyCommands") continue;
      for (const c of params.commands as BotCommand[]) {
        expect(c.command, JSON.stringify(params.scope)).toMatch(/^[a-z_]{1,32}$/);
        expect(c.description.trim().length, `${String(params.language_code)} ${c.command}`).toBeGreaterThan(0);
        expect(c.description.length).toBeLessThanOrEqual(256);
      }
    }
  });

  it("sets the profile again when the options change", () => {
    const hashes = [NONE, FULL, { ...FULL, privateAi: false }, { ...FULL, reports: false }, { ...FULL, communityChats: [] }, { ...FULL, adminChat: null }, { ...FULL, ai: false }].map((o) => profileHash(profileCalls(o), 1));
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("loadTelegramConfig", () => {
  const snapshot = "/data/snapshot.json";

  it("stays off without a token, or with one that isn't a bot token", () => {
    expect(loadTelegramConfig({}, snapshot).config).toBeNull();
    expect(loadTelegramConfig({ TELEGRAM_BOT_TOKEN: "hello" }, snapshot).config).toBeNull();
  });

  it("reads the channel, its language and the site, and never repeats the token", () => {
    const { config, note } = loadTelegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHANNEL_ID: "@tonkfun_launches", TELEGRAM_CHANNEL_LANG: "de", TELEGRAM_SITE_URL: "https://tonk-pad.vercel.app/x" }, snapshot);
    expect(config).toMatchObject({ channelId: "@tonkfun_launches", channelLang: "de", site: "https://tonk-pad.vercel.app", statePath: "/data/telegram.json" });
    expect(note).not.toContain(TOKEN);
  });

  it("ignores a channel, language or site it can't use", () => {
    const { config, note } = loadTelegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHANNEL_ID: "tonkfun", TELEGRAM_CHANNEL_LANG: "xx", TELEGRAM_SITE_URL: "http://evil.example" }, snapshot);
    expect(config).toMatchObject({ channelId: null, channelLang: "en", site: "https://www.tonkfun.fun" });
    expect(note).toContain("ignored");
    expect(loadTelegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHANNEL_ID: "-1001234567890" }, snapshot).config?.channelId).toBe("-1001234567890");
  });

  it("reads the wallets allowed to use the brand and the tokens the channel skips", () => {
    const owner = "0xF5AA2AE1336b5F5c3Ce197dDC6f53bCBafB1FD81";
    const { config, note } = loadTelegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BRAND_CREATORS: ` ${owner}, nope `, TELEGRAM_CHANNEL_SKIP: "0x00000000000000000000000000000000000000b2" }, snapshot);
    expect([...(config?.brandCreators ?? [])]).toEqual([owner.toLowerCase()]);
    expect(config?.channelSkip.has("0x00000000000000000000000000000000000000b2")).toBe(true);
    expect(note).toContain("TELEGRAM_BRAND_CREATORS: ignored");
  });
});

describe("wiring the community agent", () => {
  const GROUP = -1001234567890;
  const SECOND = -1001111111111;
  const ADMIN_CHAT = -1009876543210;
  const env = {
    TELEGRAM_BOT_TOKEN: TOKEN, ANTHROPIC_API_KEY: `sk-ant-api03-${"x".repeat(40)}`, TELEGRAM_COMMUNITY_CHATS: `${GROUP},${SECOND}`,
    TELEGRAM_ADMIN_CHAT_ID: String(ADMIN_CHAT), TELEGRAM_OWNER_IDS: "7001",
  };

  it("knows the bot by its ID and every username it answers to, each once", () => {
    expect(selfOf({ id: 9, is_bot: true, username: "TonkfunBot", active_usernames: ["TonkfunBot", "tonkfunbot", "tonk_ai", "bad name", ""] })).toEqual({ id: 9, usernames: ["TonkfunBot", "tonk_ai"] });
    expect(selfOf({ id: 9 })).toEqual({ id: 9, usernames: [] });
  });

  it("offers in the menus only what passed its checks", () => {
    expect(profileOptions(null, env, "/data/snapshot.json")).toEqual({ privateAi: false, reports: false, communityChats: [], adminChat: null, ai: false });
    const hooks = stubHooks({ groups: [GROUP], adminChat: ADMIN_CHAT });
    expect(profileOptions(hooks, env, "/data/snapshot.json")).toEqual({ privateAi: true, reports: true, communityChats: [GROUP], adminChat: ADMIN_CHAT, ai: true });
    expect(profileOptions(hooks, { ...env, TELEGRAM_AI_PRIVATE: "off" }, "/data/snapshot.json").privateAi).toBe(false);
  });

  it("starts nothing without its settings, and a failed start leaves module 14 running with only the error's name logged", async () => {
    const lines: string[] = [];
    const deps = {
      env: {}, snapshotPath: "/nowhere/snapshot.json", sender: new Sender({ call: async () => Promise.reject(new Error("no network in tests")) }, () => undefined),
      site: "https://www.tonkfun.fun", store: new TokenStore(), ethUsd: () => null, me: () => null, channel: null, brandCreators: new Set<string>(),
      log: (line: string) => void lines.push(line), now: () => 0,
    };
    expect(await wireCommunity(deps)).toBeNull();
    expect(lines).toEqual(["community off: neither TELEGRAM_COMMUNITY_CHATS nor ANTHROPIC_API_KEY is set"]);
    lines.length = 0;
    const broken = await wireCommunity({ ...deps, env, me: () => { throw new RangeError("secret detail"); } });
    expect(broken).toBeNull();
    expect(lines.at(-1)).toBe("community off: it didn't start (RangeError)");
    expect(lines.join("\n")).not.toContain("secret detail");
  });
});
