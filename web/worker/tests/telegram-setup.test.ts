import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shared/i18n/config";
import { loadTelegramConfig } from "../src/telegram/config";
import { BOT_DICTIONARIES, botLocale } from "../src/telegram/i18n";
import { en } from "../src/telegram/i18n/en";
import { profileCalls, profileHash } from "../src/telegram/profile";

const TOKEN = `123456789:${"A".repeat(35)}`;

/** Every leaf as [path, value]. */
function leaves(node: object, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const BUTTONS = ["inline.notFound", "home.check", "home.launches", "home.referral", "home.help", "home.open", "card.open", "card.refresh", "card.share", "launches.tonk", "launches.trending", "launches.explore", "referral.share", "referral.open", "help.docs", "common.back", "check.lookUp", "inline.help"];

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
      const rest = value.replace(/\/(check|launches|referral)\b/g, "").replace("@{bot}", "");
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
