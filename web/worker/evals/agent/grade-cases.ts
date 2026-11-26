import { isLocale, type Locale } from "@/shared/i18n/config";
import { ESCALATE_VALUES } from "../../src/telegram/agent/schema";
import { LINK_KEYS } from "../../src/telegram/agent/types";
import { TRIAGE_CATEGORIES, type TriageInput } from "../../src/telegram/community/types";
import { scanMessage } from "../../src/telegram/mod/rules-scan";
import { NEEDS_HUMAN, QUESTIONS, VERDICTS } from "../../src/telegram/mod/triage-prompt";
import { isTokenAddress } from "../../src/telegram/text";
import { ALLOW, OFFICIAL } from "./fixtures";
import type { AnswerCase, ModerationCase } from "./grade";

/**
 * The eval's case files (cases/*.json) read and checked, so a typo in a case
 * fails loudly instead of grading nonsense: every field known, every value
 * one the bot can produce, every pattern a valid regular expression. A
 * moderation case gives the message and its author's standing; its link
 * domains and its counts of handles and addresses come from the rules' own
 * scanner, as the pipeline works them out, unless the case sets them.
 */

type Rec = Record<string, unknown>;

const ID = /^[a-z0-9][a-z0-9-]{1,60}$/;
const MAX_QUESTION = 600;
const MAX_EARLIER = 1_000;
const MAX_TEXT = 1_000;
const ANSWER_KEYS = ["id", "question", "lang", "chat", "mode", "earlierAnswer", "askerAddresses", "translations", "expect"];
const ANSWER_EXPECT = ["mustInclude", "mustNotMatch", "escalate", "answered", "noAdvice", "links", "language"];
const MOD_KEYS = ["id", "input", "expect"];
const MOD_INPUT = ["text", "standing", "appLang", "edited", "forwarded", "replyToBot", "domains", "handles", "addresses"];
const MOD_EXPECT = ["verdict", "category", "question", "needs_human", "notPunished"];
const STANDINGS: readonly TriageInput["standing"][] = ["new", "member", "trusted"];

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && [...v].length <= max;
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string" && s !== "");
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf = (values: readonly string[], v: unknown): v is string => typeof v === "string" && values.includes(v);
const allOf = (values: readonly string[], v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((x) => oneOf(values, x));
const asAddress = (a: string) => (/^0x/i.test(a) ? a.toLowerCase() : a);

function compiles(source: string): boolean {
  try {
    new RegExp(source, "iu");
    return true;
  } catch {
    return false;
  }
}

/** Collects what's wrong with one case, by its place and field. */
class Check {
  readonly problems: string[] = [];
  constructor(private readonly where: string) {}
  fail(field: string, why: string): void {
    this.problems.push(`${this.where} ${field}: ${why}`);
  }
  known(rec: Rec, keys: readonly string[], field: string): void {
    for (const key of Object.keys(rec)) if (!keys.includes(key)) this.fail(field, `unknown field "${key}"`);
  }
  optional(rec: Rec, key: string, ok: (v: unknown) => boolean, why: string): void {
    if (rec[key] !== undefined && !ok(rec[key])) this.fail(key, why);
  }
}

function answerExpect(raw: unknown, check: Check): void {
  if (!isRec(raw)) return check.fail("expect", "an object is needed");
  check.known(raw, ANSWER_EXPECT, "expect");
  for (const key of ["mustInclude", "mustNotMatch"]) check.optional(raw, key, (v) => isTexts(v) && v.every(compiles), "a list of valid regular expressions");
  check.optional(raw, "escalate", (v) => oneOf(ESCALATE_VALUES, v), `one of ${ESCALATE_VALUES.join(", ")}`);
  check.optional(raw, "answered", isBool, "true or false");
  check.optional(raw, "noAdvice", isBool, "true or false");
  check.optional(raw, "links", (v) => allOf(LINK_KEYS, v), "link keys the bot knows");
  check.optional(raw, "language", (v) => v === "any" || (typeof v === "string" && isLocale(v)), "a site language or any");
}

function answerCase(raw: unknown, check: Check): void {
  if (!isRec(raw)) return check.fail("case", "an object is needed");
  check.known(raw, ANSWER_KEYS, "case");
  if (typeof raw.id !== "string" || !ID.test(raw.id)) check.fail("id", "lower case letters, digits and dashes");
  if (!isText(raw.question, MAX_QUESTION)) check.fail("question", `text of at most ${MAX_QUESTION} characters`);
  if (typeof raw.lang !== "string" || !isLocale(raw.lang)) check.fail("lang", "one of the site's languages");
  if (raw.chat !== "group" && raw.chat !== "private") check.fail("chat", "group or private");
  if (raw.mode !== "direct" && raw.mode !== "proactive") check.fail("mode", "direct or proactive");
  check.optional(raw, "earlierAnswer", (v) => isText(v, MAX_EARLIER), `text of at most ${MAX_EARLIER} characters`);
  check.optional(raw, "askerAddresses", (v) => isTexts(v) && v.every((a) => isTokenAddress(asAddress(a))), "token addresses");
  const translations = (v: unknown) => isRec(v) && Object.entries(v).every(([lang, text]) => isLocale(lang) && lang !== raw.lang && isText(text, MAX_QUESTION));
  check.optional(raw, "translations", translations, "questions in other site languages");
  answerExpect(raw.expect, check);
}

function moderationExpect(raw: unknown, check: Check): void {
  if (!isRec(raw)) return check.fail("expect", "an object is needed");
  check.known(raw, MOD_EXPECT, "expect");
  check.optional(raw, "verdict", (v) => allOf(VERDICTS, v), `some of ${VERDICTS.join(", ")}`);
  check.optional(raw, "category", (v) => allOf(TRIAGE_CATEGORIES, v), "categories the check knows");
  check.optional(raw, "question", (v) => oneOf(QUESTIONS, v), `one of ${QUESTIONS.join(", ")}`);
  check.optional(raw, "needs_human", (v) => oneOf(NEEDS_HUMAN, v), "none or an escalation");
  check.optional(raw, "notPunished", isBool, "true or false");
}

function moderationCase(raw: unknown, check: Check): void {
  if (!isRec(raw)) return check.fail("case", "an object is needed");
  check.known(raw, MOD_KEYS, "case");
  if (typeof raw.id !== "string" || !ID.test(raw.id)) check.fail("id", "lower case letters, digits and dashes");
  const input = raw.input;
  if (!isRec(input)) check.fail("input", "an object is needed");
  else {
    check.known(input, MOD_INPUT, "input");
    if (!isText(input.text, MAX_TEXT)) check.fail("input.text", `text of at most ${MAX_TEXT} characters`);
    check.optional(input, "standing", (v) => oneOf(STANDINGS, v), "new, member or trusted");
    check.optional(input, "appLang", (v) => typeof v === "string" && isLocale(v), "one of the site's languages");
    for (const key of ["edited", "forwarded", "replyToBot"]) check.optional(input, key, isBool, "true or false");
    check.optional(input, "domains", isTexts, "a list of domains");
    for (const key of ["handles", "addresses"]) check.optional(input, key, (v) => Number.isInteger(v) && Number(v) >= 0, "a count");
  }
  moderationExpect(raw.expect, check);
}

/** Every case checked, each ID once: the cases, or one error naming every problem. */
function readAll<T extends { id: string }>(raw: unknown, file: string, one: (item: unknown, check: Check) => void): T[] {
  if (!Array.isArray(raw)) throw new Error(`${file}: a list of cases is needed`);
  const problems: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const check = new Check(`${file} #${i + 1}${isRec(item) && typeof item.id === "string" ? ` (${item.id})` : ""}`);
    one(item, check);
    problems.push(...check.problems);
    const id = isRec(item) ? item.id : null;
    if (typeof id === "string" && seen.has(id)) problems.push(`${file} #${i + 1}: the id ${id} is used twice`);
    if (typeof id === "string") seen.add(id);
  });
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return raw as T[];
}

export const readAnswerCases = (raw: unknown, file: string): AnswerCase[] => readAll<AnswerCase>(raw, file, answerCase);

/** The moderation cases, each with its full TriageInput. */
export function readModerationCases(raw: unknown, file: string): ModerationCase[] {
  return readAll<{ id: string; input: Partial<TriageInput> & { text: string }; expect: ModerationCase["expect"] }>(raw, file, moderationCase).map((c) => {
    const { markers } = scanMessage({ text: c.input.text, entities: [], allow: ALLOW, bot: OFFICIAL.bot, admins: [], packAddresses: new Set<string>() });
    const appLang: Locale = c.input.appLang ?? "en";
    const input: TriageInput = {
      text: c.input.text,
      edited: c.input.edited ?? false,
      forwarded: c.input.forwarded ?? false,
      standing: c.input.standing ?? "member",
      domains: c.input.domains ?? markers.domains,
      handles: c.input.handles ?? markers.handles,
      addresses: c.input.addresses ?? markers.addresses.length,
      replyToBot: c.input.replyToBot ?? false,
      appLang,
    };
    return { id: c.id, input, expect: c.expect };
  });
}

/** The languages every general answer case is translated into: what --lang can run. */
export function translatedLanguages(cases: readonly AnswerCase[]): Locale[] {
  const counts = new Map<Locale, number>();
  for (const c of cases) for (const lang of Object.keys(c.translations ?? {})) if (isLocale(lang)) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  return [...counts.keys()].sort();
}
