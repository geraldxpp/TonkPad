import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type CommunityConfig, DEFAULT_HELPLINE_URL, loadCommunityConfig } from "../src/telegram/community/config";

const SNAPSHOT = "/data/snapshot.json";
const KEY = `sk-ant-api03-${"k".repeat(40)}`;
const TOKEN = `123456789:${"T".repeat(35)}`;
const GROUP = "-1001234567890";
const ADMIN = "-1009876543210";
const OWNER = "7001";
const BASE = { ANTHROPIC_API_KEY: KEY, TELEGRAM_BOT_TOKEN: TOKEN };
const COMMUNITY = { ...BASE, TELEGRAM_COMMUNITY_CHATS: GROUP, TELEGRAM_ADMIN_CHAT_ID: ADMIN, TELEGRAM_OWNER_IDS: OWNER };

const load = (env: Record<string, string>) => loadCommunityConfig(env, SNAPSHOT);
/** The config of an env that must load. */
function on(env: Record<string, string>): { config: CommunityConfig; note: string } {
  const { config, note } = load(env);
  if (!config) throw new Error(`expected a config, got: ${note}`);
  return { config, note };
}

describe("loadCommunityConfig: when it runs", () => {
  it("is off without community chats and an API key", () => {
    const { config, note } = load({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_ADMIN_CHAT_ID: ADMIN, TELEGRAM_OWNER_IDS: OWNER });
    expect(config).toBeNull();
    expect(note).toBe("community off: neither TELEGRAM_COMMUNITY_CHATS nor ANTHROPIC_API_KEY is set");
    expect(load({ TELEGRAM_COMMUNITY_CHATS: "  ", ANTHROPIC_API_KEY: "" }).config).toBeNull();
  });

  it("gives private AI and no groups for a key alone, with every default", () => {
    const { config, note } = on(BASE);
    expect(config).toEqual({
      apiKey: KEY,
      chats: [],
      adminChat: null,
      owners: [],
      adminLang: "en",
      groupLang: "en",
      mode: "observe",
      budgetUsd: 3,
      answerModel: "claude-sonnet-5-5",
      privateAi: true,
      userCodeKey: createHash("sha256").update(`tonkfun user code:${TOKEN}`).digest("hex"),
      allowedDomains: [],
      allowedBots: [],
      officialX: [],
      helplineUrl: DEFAULT_HELPLINE_URL,
      statePath: "/data/community.json",
    });
    expect(note).toBe("community on: no community groups, admin chat not set, 0 owners; AI on in private chats, up to $3 a day, answers on claude-sonnet-5-5");
  });

  it("runs the groups with an admin chat and an owner", () => {
    const { config, note } = on({ ...COMMUNITY, TELEGRAM_COMMUNITY_CHATS: `${GROUP}, -1005555555555, ${GROUP}`, TELEGRAM_OWNER_IDS: "7001,7002" });
    expect(config).toMatchObject({ chats: [-1001234567890, -1005555555555], adminChat: -1009876543210, owners: [7001, 7002], privateAi: true });
    expect(note).toBe("community on: 2 groups, mode observe, admin chat set, 2 owners; AI on in groups and private chats, up to $3 a day, answers on claude-sonnet-5-5");
  });

  it("ignores the groups without an admin chat or an owner, and says which is missing", () => {
    const noAdmin = on({ ...COMMUNITY, TELEGRAM_ADMIN_CHAT_ID: "" });
    expect(noAdmin.config.chats).toEqual([]);
    expect(noAdmin.note).toContain("TELEGRAM_COMMUNITY_CHATS ignored: community groups need TELEGRAM_ADMIN_CHAT_ID");
    const noOwner = on({ ...COMMUNITY, TELEGRAM_OWNER_IDS: "" });
    expect(noOwner.config.chats).toEqual([]);
    expect(noOwner.note).toContain("need TELEGRAM_OWNER_IDS");
    const neither = load({ TELEGRAM_COMMUNITY_CHATS: GROUP });
    expect(neither.config).toBeNull();
    expect(neither.note).toContain("need TELEGRAM_ADMIN_CHAT_ID and TELEGRAM_OWNER_IDS");
  });

  it("never lets the admin chat be a community group, where alerts would be public", () => {
    const { config, note } = on({ ...COMMUNITY, TELEGRAM_ADMIN_CHAT_ID: GROUP });
    expect(config).toMatchObject({ chats: [], adminChat: null });
    expect(note).toContain("TELEGRAM_ADMIN_CHAT_ID is one of TELEGRAM_COMMUNITY_CHATS");
  });

  it("runs groups on rules alone without a key", () => {
    const { config, note } = on({ ...COMMUNITY, ANTHROPIC_API_KEY: "" });
    expect(config).toMatchObject({ chats: [-1001234567890], apiKey: null, privateAi: false, userCodeKey: null });
    expect(note).toContain("AI off (no usable ANTHROPIC_API_KEY)");
  });

  it("is off with a key alone when private AI is switched off", () => {
    const { config, note } = load({ ...BASE, TELEGRAM_AI_PRIVATE: "off" });
    expect(config).toBeNull();
    expect(note).toContain("private AI is off");
  });
});

describe("loadCommunityConfig: values it can't use", () => {
  it("ignores malformed chat, admin chat and owner IDs with notes, keeping the good ones", () => {
    const { config, note } = on({ ...COMMUNITY, TELEGRAM_COMMUNITY_CHATS: `-123, abc, -100abc, ${GROUP}, 1001234567890`, TELEGRAM_OWNER_IDS: "-5, 0, x, 7001, 12.5" });
    expect(config).toMatchObject({ chats: [-1001234567890], owners: [7001] });
    expect(note).toContain("TELEGRAM_COMMUNITY_CHATS: ignored an entry that isn't a supergroup ID (-100…)");
    expect(note).toContain("TELEGRAM_OWNER_IDS: ignored an entry that isn't a Telegram user ID");
    expect(on({ ...BASE, TELEGRAM_ADMIN_CHAT_ID: "123" }).config.adminChat).toBeNull();
    expect(on({ ...BASE, TELEGRAM_ADMIN_CHAT_ID: "-4567" }).config.adminChat).toBe(-4567);
    expect(on({ ...BASE, TELEGRAM_ADMIN_CHAT_ID: `${ADMIN},-4567` }).note).toContain("TELEGRAM_ADMIN_CHAT_ID ignored (one chat ID)");
  });

  it("reads budgets, and turns AI off for one it can't read rather than spending", () => {
    expect(on({ ...BASE, TELEGRAM_AI_BUDGET_USD: "2.5" }).config.budgetUsd).toBe(2.5);
    expect(on({ ...BASE, TELEGRAM_AI_BUDGET_USD: "1000" }).config.budgetUsd).toBe(1000);
    for (const bad of ["abc", "-1", "5000", "1e3", "$3", "3,50", "off"]) {
      const { config, note } = on({ ...COMMUNITY, TELEGRAM_AI_BUDGET_USD: bad });
      expect(config, bad).toMatchObject({ budgetUsd: 0, apiKey: null, privateAi: false });
      expect(note, bad).toContain("TELEGRAM_AI_BUDGET_USD ignored (a number of dollars from 0 to 1000): AI is off until it is fixed");
    }
  });

  it("turns every model call off with a budget of 0, and keeps moderation", () => {
    const { config, note } = on({ ...COMMUNITY, TELEGRAM_AI_BUDGET_USD: "0" });
    expect(config).toMatchObject({ budgetUsd: 0, apiKey: null, privateAi: false, userCodeKey: null, chats: [-1001234567890] });
    expect(note).toContain("AI off (the daily budget is 0)");
    expect(load({ ...BASE, TELEGRAM_AI_BUDGET_USD: "0" }).config).toBeNull();
  });

  it("runs answers on Sonnet 5.5 by default, or on the model TELEGRAM_AI_ANSWER_MODEL names, any case", () => {
    expect(on(BASE).config.answerModel).toBe("claude-sonnet-5-5");
    for (const model of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] as const) {
      const { config, note } = on({ ...COMMUNITY, TELEGRAM_AI_ANSWER_MODEL: ` ${model.toUpperCase()} ` });
      expect(config.answerModel).toBe(model);
      expect(note).toContain(`up to $3 a day, answers on ${model}`);
      expect(note).not.toContain("TELEGRAM_AI_ANSWER_MODEL ignored");
    }
    // Without AI the model is still read, and the note doesn't name it.
    const rulesOnly = on({ ...COMMUNITY, ANTHROPIC_API_KEY: "", TELEGRAM_AI_ANSWER_MODEL: "claude-opus-5-5" });
    expect(rulesOnly.config.answerModel).toBe("claude-opus-5-5");
    expect(rulesOnly.note).not.toContain("answers on");
  });

  it("ignores any other answer model with a note, and runs answers on the default", () => {
    for (const bad of ["claude-opus-4-8", "claude-haiku-5-5-20261101", "Sonnet 5.5", "claude-sonnet-5-5,claude-opus-5-5", "gpt-5"]) {
      const { config, note } = on({ ...COMMUNITY, TELEGRAM_AI_ANSWER_MODEL: bad });
      expect(config.answerModel, bad).toBe("claude-sonnet-5-5");
      expect(note, bad).toContain("answers on claude-sonnet-5-5");
      expect(note, bad).toContain("TELEGRAM_AI_ANSWER_MODEL ignored (one of claude-sonnet-5-5, claude-opus-5-5, claude-haiku-5-5)");
      expect(note, bad).not.toContain(bad);
    }
  });

  it("reads the mode and the languages, any case, and ignores others", () => {
    const { config } = on({ ...BASE, TELEGRAM_COMMUNITY_MODE: "STRICT", TELEGRAM_ADMIN_LANG: "DE", TELEGRAM_COMMUNITY_LANG: "es" });
    expect(config).toMatchObject({ mode: "strict", adminLang: "de", groupLang: "es" });
    const bad = on({ ...BASE, TELEGRAM_COMMUNITY_MODE: "lenient", TELEGRAM_ADMIN_LANG: "xx", TELEGRAM_COMMUNITY_LANG: "english" });
    expect(bad.config).toMatchObject({ mode: "observe", adminLang: "en", groupLang: "en" });
    expect(bad.note).toContain("TELEGRAM_COMMUNITY_MODE ignored (one of observe, relaxed, normal, strict)");
    expect(bad.note).toContain("TELEGRAM_ADMIN_LANG ignored (one of the site's language codes)");
    expect(bad.note).toContain("TELEGRAM_COMMUNITY_LANG ignored");
  });

  it("keeps bare host names as the link rules compare them, and never Telegram's or X's", () => {
    const { config, note } = on({ ...BASE, TELEGRAM_ALLOWED_DOMAINS: "Example.COM, www.foo.org, docs.bar.io., xn--bcher-kva.de, bücher.de, https://evil.com, evil.com/x, t.me, x.com, mobile.twitter.com, localhost, 1.2.3.4, a..b, www.com" });
    expect(config.allowedDomains).toEqual(["example.com", "foo.org", "docs.bar.io", "bücher.de"]);
    expect(note).toContain("TELEGRAM_ALLOWED_DOMAINS: ignored an entry that isn't a host name such as example.com");
    expect(note).toContain("TELEGRAM_ALLOWED_DOMAINS: ignored a Telegram or X host (their links follow their own rules)");
  });

  it("reads bot usernames and X handles, with or without @", () => {
    const { config, note } = on({ ...BASE, TELEGRAM_ALLOWED_BOTS: "@SafeguardBot, x_bot, helper, 1bot, ab", TELEGRAM_OFFICIAL_X: "@TonkFun, tonkfun_fun, abc, way_too_long_handle, bad-handle" });
    expect(config.allowedBots).toEqual(["safeguardbot", "x_bot"]);
    expect(config.officialX).toEqual(["tonkfun", "tonkfun_fun"]);
    expect(note).toContain("TELEGRAM_ALLOWED_BOTS: ignored an entry that isn't a bot username ending in bot");
    expect(note).toContain("TELEGRAM_OFFICIAL_X: ignored an entry that isn't an X handle (5 to 15 letters, digits or _)");
  });

  it("takes only an https helpline", () => {
    expect(on({ ...BASE, TELEGRAM_HELPLINE_URL: "https://example.org/help?region=eu" }).config.helplineUrl).toBe("https://example.org/help?region=eu");
    for (const bad of ["http://example.org", "javascript:alert(1)", "https://user:pw@example.org", "https://localhost", "help"]) {
      const { config, note } = on({ ...BASE, TELEGRAM_HELPLINE_URL: bad });
      expect(config.helplineUrl, bad).toBe(DEFAULT_HELPLINE_URL);
      expect(note, bad).toContain("TELEGRAM_HELPLINE_URL ignored (an https address)");
    }
  });

  it("reads the on and off switches, and fails closed on others", () => {
    expect(on({ ...COMMUNITY, TELEGRAM_AI_PRIVATE: "false" }).config.privateAi).toBe(false);
    expect(on({ ...BASE, TELEGRAM_AI_USER_CODE: "OFF" }).config.userCodeKey).toBeNull();
    expect(on({ ...BASE, TELEGRAM_AI_USER_CODE: "yes" }).config.userCodeKey).toMatch(/^[0-9a-f]{64}$/);
    const unclear = on({ ...COMMUNITY, TELEGRAM_AI_PRIVATE: "maybe", TELEGRAM_AI_USER_CODE: "sometimes" });
    expect(unclear.config).toMatchObject({ privateAi: false, userCodeKey: null });
    expect(unclear.note).toContain("TELEGRAM_AI_PRIVATE ignored (on or off): off until it is fixed");
    expect(unclear.note).toContain("TELEGRAM_AI_USER_CODE ignored (on or off)");
  });

  it("keeps a state path that is set", () => {
    expect(on({ ...BASE, TELEGRAM_COMMUNITY_STATE_PATH: "/vol/community-state.json" }).config.statePath).toBe("/vol/community-state.json");
  });
});

describe("loadCommunityConfig: secrets", () => {
  it("derives the user-code key from the bot token, and needs the token for it", () => {
    const { config } = on(BASE);
    expect(config.userCodeKey).toBe(createHash("sha256").update(`tonkfun user code:${TOKEN}`).digest("hex"));
    expect(on({ ANTHROPIC_API_KEY: KEY }).config.userCodeKey).toBeNull();
  });

  it("ignores a key that can't be one, and never repeats a key, token or ID in its note", () => {
    const pasted = `"${KEY}"`;
    const { config, note } = on({ ...COMMUNITY, ANTHROPIC_API_KEY: pasted });
    expect(config.apiKey).toBeNull();
    expect(note).toContain("ANTHROPIC_API_KEY ignored (it doesn't look like an API key)");
    const notes = [
      note,
      on(COMMUNITY).note,
      on({ ...COMMUNITY, TELEGRAM_AI_BUDGET_USD: "0" }).note,
      on({ ...COMMUNITY, TELEGRAM_AI_BUDGET_USD: KEY }).note,
      on({ ...COMMUNITY, TELEGRAM_OWNER_IDS: KEY, TELEGRAM_ALLOWED_DOMAINS: KEY, TELEGRAM_HELPLINE_URL: KEY, TELEGRAM_AI_ANSWER_MODEL: KEY }).note,
      load({ ANTHROPIC_API_KEY: KEY, TELEGRAM_AI_PRIVATE: "off", TELEGRAM_BOT_TOKEN: TOKEN }).note,
    ];
    const hash = createHash("sha256").update(`tonkfun user code:${TOKEN}`).digest("hex");
    for (const line of notes) {
      for (const secret of [KEY, "k".repeat(20), TOKEN, hash, GROUP, ADMIN, OWNER]) expect(line).not.toContain(secret);
    }
  });
});
