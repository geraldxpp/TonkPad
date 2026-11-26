import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import { DICTIONARIES as SITE } from "@/shared/i18n/dictionaries";
import { LANES } from "../src/telegram/claude/types";
import { ALERT_KINDS, COUNTER_KEYS, ESCALATIONS, RULE_CATEGORIES, STRICTNESS_LEVELS } from "../src/telegram/community/types";
import type { CommunityDictionary } from "../src/telegram/community/words";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import { ASK_PROMPTS, COMMUNITY_DICTIONARIES, communityWords } from "../src/telegram/i18n/community";
import { en } from "../src/telegram/i18n/community/en";

const CODES: Locale[] = LOCALES.map((l) => l.code);

/** Every leaf as [path, value]. */
function leaves(node: object, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const words = (code: Locale): CommunityDictionary => COMMUNITY_DICTIONARIES[code];

/** The placeholders community/words.ts names for each string (sorted); every other string has none. */
const NAMED: Record<string, string[]> = {
  "help.ask": ["bot", "button"],
  "help.groupAsk": ["bot", "button"],
  "answer.scoreLine": ["level", "score"],
  "check.prompt": ["duration", "mentions"],
  "check.choose": ["target"],
  "check.welcome": ["mentions"],
  "check.others": ["count"],
  "mod.removed": ["mentions", "reason"],
  "mod.warned": ["mentions", "reason"],
  "mod.banned": ["mentions", "reason"],
  "mod.muted": ["duration", "mentions", "reason"],
  "mod.linkRemoved": ["mentions"],
  "mod.newcomer": ["mentions"],
  "mod.summary": ["count"],
  "appeal.none": ["group"],
  "appeal.muted": ["group"],
  "appeal.removed": ["group"],
  "appeal.restricted": ["group"],
  "appeal.reason": ["reason"],
  "admin.handledBy": ["admin"],
  "admin.more": ["count"],
  "admin.budget.warn": ["cap", "spent"],
  "admin.budget.lane": ["lane"],
  "admin.budget.cap": ["cap"],
  "admin.rights.missing": ["group"],
  "admin.rights.removed": ["group"],
  "admin.setup.owner": ["group"],
  "admin.setup.members": ["count"],
};
function named(path: string): string[] {
  if (/^mod\.(minutes|hours|days)\./.test(path)) return ["count"];
  if (path === "admin.confirm.strictness") return ["admin", "group", "level"];
  if (path === "admin.confirm.aiOn" || path === "admin.confirm.aiOff") return ["admin"];
  if (path.startsWith("admin.confirm.")) return ["admin", "group"];
  return NAMED[path] ?? [];
}

/** Command words that may carry a slash: the members' and the admins' commands. */
const COMMAND = /\/(ask|rules|report|check|start|status|pause|resume|proactive|strict|raid|trust|untrust|trusted|forget|mod|ai)(?![A-Za-z0-9_])/g;
const commandsIn = (text: string) => [...text.matchAll(COMMAND)].map((m) => m[1]).sort();
/** The names the gate keeps whole; any other dot inside a word reads as a domain. */
const NAMES = /tonkfun\.fun|pump\.fun|bonk\.fun/gi;
const WORD = /[\p{L}\p{N}\p{M}]/u;

/** `phrase` stands in `text` as a whole phrase, not as the start or end of a longer word ("AI answers"). */
function containsPhrase(text: string, phrase: string): boolean {
  for (let i = text.indexOf(phrase); i !== -1; i = text.indexOf(phrase, i + 1)) {
    const before = [...text.slice(0, i)].at(-1) ?? "";
    const after = [...text.slice(i + phrase.length)][0] ?? "";
    if (!WORD.test(before) && !WORD.test(after)) return true;
  }
  return false;
}

/** Every string the bot may send: the community words and module 14's, in every language. */
const ALL = CODES.flatMap((code) => [...leaves(words(code)).map(([path, value]) => ({ code, path, value })), ...leaves(BOT_DICTIONARIES[code]).map(([path, value]) => ({ code, path: `bot.${path}`, value }))]);
/** The strings this package wrote: the community words, and module 14's Ask button, inline mode's Ask result (and its /ask button) and the profile it shows while AI is on. */
const INLINE_ASK = ["ask", "askAs", "askWhere", "askWhereGroup", "askWherePrivate", "askPosted", "askNo"].map((key) => `bot.inline.${key}`);
const OURS = ALL.filter((s) => !s.path.startsWith("bot.") || ["bot.home.ask", ...INLINE_ASK, "bot.profile.shortAi", "bot.profile.descriptionAi"].includes(s.path));

describe("the community's words", () => {
  const english = new Map(leaves(en));

  it("English holds exactly the placeholders community/words.ts names, and a word for every rule, case and count", () => {
    for (const [path, value] of english) expect(placeholders(value), path).toEqual(named(path));
    expect(Object.keys(en.mod.reasons).sort()).toEqual([...RULE_CATEGORIES].sort());
    expect(Object.keys(en.admin.kinds).sort()).toEqual([...ALERT_KINDS].sort());
    expect(Object.keys(en.admin.categories).sort()).toEqual([...new Set([...RULE_CATEGORIES, ...ESCALATIONS])].sort());
    expect(Object.keys(en.admin.levels).sort()).toEqual([...STRICTNESS_LEVELS].sort());
    expect(Object.keys(en.admin.counters).sort()).toEqual([...COUNTER_KEYS].sort());
    expect(Object.keys(en.admin.lanes).sort()).toEqual([...LANES].sort());
  });

  it.each(CODES)("%s has the English keys, placeholders and commands, one line each, nothing empty", (code) => {
    const list = leaves(words(code));
    expect(list.map(([path]) => path).sort()).toEqual([...english.keys()].sort());
    for (const [path, value] of list) {
      expect(value.trim(), `${code} ${path}`).not.toBe("");
      expect(value, `${code} ${path}`).toBe(value.trim());
      expect(value, `${code} ${path}`).not.toMatch(/\n/);
      expect(placeholders(value), `${code} ${path}`).toEqual(placeholders(english.get(path) ?? ""));
      expect(commandsIn(value), `${code} ${path}`).toEqual(commandsIn(english.get(path) ?? ""));
    }
  });

  it.each(CODES)("%s fits Telegram's limits for buttons, toasts, the placeholder and the command menu", (code) => {
    const w = words(code);
    const buttons = [...Object.values(w.links), ...Object.values(w.admin.buttons), w.check.button, w.answer.askButton, w.answer.shareButton, w.crisis.button, w.mod.why, w.appeal.ask, w.help.privacy];
    for (const label of buttons) expect([...label].length, `${code} ${label}`).toBeLessThanOrEqual(30);
    // The /mod panel marks the current level with "• ".
    for (const level of Object.values(w.admin.levels)) expect([...level].length, `${code} ${level}`).toBeLessThanOrEqual(28);
    // Answer buttons share a row and are told apart by their labels.
    expect(new Set(Object.values(w.links)).size, code).toBe(Object.keys(w.links).length);
    const toasts = [w.check.notYou, w.check.wrong, w.check.passed, w.check.retry, w.appeal.sent, w.appeal.once, w.admin.done, w.admin.noRight, w.admin.onlyOwners, w.admin.anonymous, w.admin.isAdmin];
    for (const toast of toasts) expect([...toast].length, `${code} ${toast}`).toBeLessThanOrEqual(200);
    expect([...w.answer.askPlaceholder].length, code).toBeLessThanOrEqual(64);
    for (const description of Object.values(w.commands)) expect(description.length, `${code} ${description}`).toBeLessThanOrEqual(256);
  });

  it("is translated, not English with another label", () => {
    for (const code of CODES.filter((c) => c !== "en")) {
      const w = words(code);
      expect([w.answer.busy, w.check.prompt, w.crisis.body].filter((text, i) => text === [en.answer.busy, en.check.prompt, en.crisis.body][i]), code).toEqual([]);
    }
  });

  it("knows an answer by its label and footer: distinct per language, and no other string carries one as a phrase", () => {
    const frames = ALL.filter((s) => s.path === "answer.label" || s.path === "answer.footer");
    expect(new Set(frames.map((f) => f.value)).size).toBe(CODES.length * 2);
    for (const frame of frames) {
      const carriers = ALL.filter((s) => (s.code !== frame.code || s.path !== frame.path) && containsPhrase(s.value, frame.value));
      expect(carriers.map((s) => `${s.code} ${s.path}`), frame.value).toEqual([]);
    }
  });

  it("knows a private reply to the Ask prompt in any language, and no other string reads as one", () => {
    expect(ASK_PROMPTS.size).toBe(CODES.length);
    for (const code of CODES) expect(ASK_PROMPTS.has(words(code).answer.askPrompt), code).toBe(true);
    expect(ALL.filter((s) => ASK_PROMPTS.has(s.value)).map((s) => s.path)).toEqual(CODES.map(() => "answer.askPrompt"));
  });

  it("writes no @, #, $, backslash or link, a slash only before the bot's commands, and a colon only to end a phrase", () => {
    for (const { code, path, value } of OURS) {
      const rest = value.replace(COMMAND, "");
      expect(rest, `${code} ${path}`).not.toMatch(/[@#$\\/]/);
      // Alerts drop any other colon from the sentences they carry, since it could start a link ("tg:").
      expect(rest, `${code} ${path}`).not.toMatch(/:(?!\s|$)/);
      expect(rest, `${code} ${path}`).not.toMatch(/https?|www\.|t\.me|tg:|telegram\.me/i);
      expect(rest.replace(NAMES, ""), `${code} ${path}`).not.toMatch(/[\p{L}\p{N}_-][.．][\p{L}]/u);
    }
  });

  it("keeps the voice: no exclamation marks and no emoji", () => {
    for (const { code, path, value } of OURS) expect(value, `${code} ${path}`).not.toMatch(/[!¡！]|\p{Extended_Pictographic}/u);
  });

  it("gives each language its own words, and English for anything else", () => {
    for (const code of CODES) expect(communityWords(code)).toBe(COMMUNITY_DICTIONARIES[code]);
    expect(communityWords("xx" as Locale)).toBe(en);
    expect(communityWords("constructor" as Locale)).toBe(en);
  });

  it.each(CODES)("%s: the privacy page quotes the bot's own button labels", (code) => {
    const w = words(code);
    const p = SITE[code].privacy;
    expect(p.ai.decisions).toContain(w.mod.why);
    expect(p.rights.choose).toContain(w.answer.askButton);
    expect(p.keeps.admins).toContain(w.answer.shareButton);
  });

  it.each(CODES)("%s: the bot's profile while AI is on says its answers come from Claude, by Anthropic, and both profiles fit Telegram's limits", (code) => {
    const { profile, home } = BOT_DICTIONARIES[code];
    for (const short of [profile.short, profile.shortAi]) expect(short.length).toBeLessThanOrEqual(120);
    for (const description of [profile.description, profile.descriptionAi]) expect(description.length).toBeLessThanOrEqual(512);
    expect(profile.descriptionAi).toMatch(/Claude/);
    expect(profile.descriptionAi).toMatch(/Anthropic/);
    // Module 14's own profile, restored for while AI is off, names no AI.
    expect(profile.description).not.toMatch(/Claude|Anthropic/);
    expect([...home.ask].length).toBeLessThanOrEqual(30);
    if (code === "en") return;
    const english = BOT_DICTIONARIES.en;
    expect(home.ask).not.toBe(english.home.ask);
    expect(profile.shortAi).not.toBe(english.profile.shortAi);
    expect(profile.descriptionAi).not.toBe(english.profile.descriptionAi);
  });
});
