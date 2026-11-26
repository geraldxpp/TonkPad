import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import type { CommunityDictionary } from "../src/telegram/community/words";
import { COMMUNITY_DICTIONARIES } from "../src/telegram/i18n/community";
import { en } from "../src/telegram/i18n/community/en";
import { testWords } from "./community-fixtures-words";

const CODES: Locale[] = LOCALES.map((l) => l.code);
const words = (code: Locale): CommunityDictionary => COMMUNITY_DICTIONARIES[code];

/** Every leaf as [path, value]. */
function leaves(node: object, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));
}
const at = (d: CommunityDictionary, path: string): string => new Map(leaves(d)).get(path) ?? "";

/** The words added in English first (report.usagePrivate, the admin chat's new lines, the help lines naming inline mode's Ask and its note when a question never came), and the welcome and group /report line rewritten with them. */
const NEW_WORDS = [
  "help.ask",
  "help.groupAsk",
  "answer.askLost",
  "check.welcome",
  "report.usage",
  "report.usagePrivate",
  "admin.reportReason",
  "admin.preview",
  "admin.more",
  "admin.budget.auth",
  "admin.budget.badRequest",
  "admin.budget.ramp",
  "admin.setup.autoDelete",
];

/** The bot's commands as alerts-view-text.ts keeps them in a line it cleans: after a space or at the start, before a space, a stop or the end. */
const COMMAND = /\/(ask|rules|report|check|start|status|pause|resume|proactive|strict|raid|trust|untrust|trusted|forget|mod|ai|help|id)(?![A-Za-z0-9_])/g;

/** The words "if it did" in each language's probable-secret notice: the advice to move funds holds only if the message held a secret. */
const IF_IT_DID: Record<Locale, string> = {
  en: "If it did,",
  es: "Si era así,",
  pt: "Se era o caso,",
  fr: "Si c’est le cas,",
  de: "Falls ja,",
  ru: "Если так и было,",
  tr: "Öyleyse,",
  zh: "如果确实包含，",
  ja: "含まれていた場合は、",
  ko: "그렇다면",
  vi: "Nếu đúng là vậy,",
  id: "Jika memang begitu,",
};

/** The word for people that the new-member check's "and N more" carries in some languages, which a count of alerts must not. */
const PEOPLE: Partial<Record<Locale, string>> = { tr: "kişi", zh: "人", ja: "人", ko: "명", vi: "người" };

describe("the community's words, after the review's fixes", () => {
  it.each(CODES)("%s: the welcome says the bot's answers are written by AI, Claude by Anthropic", (code) => {
    const w = words(code);
    const ai = w.answer.footer.split(" · ")[0].toLocaleLowerCase(code);
    expect(w.check.welcome.toLocaleLowerCase(code)).toContain(ai);
    expect(w.check.welcome).toContain("Claude");
    expect(w.check.welcome).toContain("Anthropic");
  });

  it("asks for a reply in a group and for the story in a private chat", () => {
    expect(en.report.usage).toBe("Reply to the message you want to report with /report.");
    expect(en.report.usagePrivate).toMatch(/^Write what happened after \/report/);
    for (const code of CODES) expect(words(code).report.usage, code).not.toBe(words(code).report.usagePrivate);
  });

  it.each(CODES.filter((c) => c !== "en"))("%s translates the words added in English first", (code) => {
    const untranslated = NEW_WORDS.filter((path) => at(words(code), path) === at(en, path));
    expect(untranslated).toEqual([]);
  });

  it.each(CODES)("%s: every command in the admin chat's words stands after a space, so an alert's cleaning keeps it", (code) => {
    for (const [path, value] of leaves(words(code).admin)) {
      for (const m of value.matchAll(COMMAND)) {
        const before = [...value.slice(0, m.index)].at(-1) ?? "";
        const after = [...value.slice((m.index ?? 0) + m[0].length)][0] ?? "";
        expect(before === "" || /\s/u.test(before), `${code} admin.${path}: ${m[0]} after “${before}”`).toBe(true);
        expect(after === "" || /[\s.,;!?)]/u.test(after), `${code} admin.${path}: ${m[0]} before “${after}”`).toBe(true);
      }
    }
  });

  it("names the budget's failures in words of their own", () => {
    const b = en.admin.budget;
    expect(new Set([b.circuit, b.auth, b.badRequest, b.ramp, b.billing, b.notFound, b.restored]).size).toBe(7);
    expect(b.auth).toMatch(/ANTHROPIC_API_KEY/);
    for (const code of CODES) expect(words(code).admin.budget.auth, code).toContain("ANTHROPIC_API_KEY");
  });

  it.each(CODES)("%s: the probable-secret notice tells people to move funds only if the message held a secret", (code) => {
    expect(words(code).safety.secretProbable).toContain(IF_IT_DID[code]);
  });

  it.each(Object.keys(PEOPLE) as Locale[])("%s: a digest's “and N more” counts alerts, not people", (code) => {
    const w = words(code);
    const people = PEOPLE[code] ?? "";
    expect(w.check.others).toContain(people);
    expect(w.admin.more).not.toContain(people);
    expect(w.admin.more).toContain("{count}");
  });

  // Telegram refuses to restrict or ban an administrator the bot didn't promote, so Trust, Ban, Unmute and Mute 1 h on an alert about one can't work until the account's rights change.
  it.each(CODES)("%s: a button pressed on an alert about an admin says why it can't work, not “try again”", (code) => {
    const w = words(code);
    expect(typeof w.admin.isAdmin, code).toBe("string");
    expect(w.admin.isAdmin.trim(), code).not.toBe("");
    expect([...w.admin.isAdmin].length, code).toBeLessThanOrEqual(200);
    expect(w.admin.isAdmin, code).not.toBe(w.check.retry);
    expect(w.admin.isAdmin, code).toContain("Telegram");
    if (code === "en") expect(w.admin.isAdmin).toBe("That account is an admin: change its admin rights in Telegram first.");
    else expect(w.admin.isAdmin, code).not.toBe(en.admin.isAdmin);
  });

  it("gives the tests' placeholder words every English key, with the same placeholders", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const english = new Map(leaves(en));
    const fixture = leaves(testWords);
    expect(fixture.map(([path]) => path).sort()).toEqual([...english.keys()].sort());
    for (const [path, value] of fixture) expect(placeholders(value), path).toEqual(placeholders(english.get(path) ?? ""));
  });
});
