import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import { type AllowList, ESCALATIONS, type OfficialAccounts, TRIAGE_CATEGORIES, type TriageInput, type TriageVerdict } from "../community/types";
import { maskForModel } from "./secrets";
import { TRIAGE_EXAMPLES } from "./triage-prompt-examples";
import { RULES_HOLD, TRIAGE_FIELDS, TRIAGE_INTRO } from "./triage-prompt-text";

/**
 * What Haiku's check sees (prompts/15-community-agent.md, Haiku's check):
 * a system prompt that is the same bytes for every message (the job, each
 * field defined, the official accounts, worked examples and the rules-hold
 * line; cached for an hour), the verdict's JSON schema, and one message as
 * JSON in the user turn, with no ID, name or username.
 */

/** The verdict's fields in the schema's order: the one-line reason first, so the labels follow from it. */
export const VERDICT_FIELDS = ["reason", "verdict", "category", "question", "needs_human", "dm_scam_mention", "language"] as const satisfies readonly (keyof TriageVerdict)[];
export const VERDICTS = ["ok", "spam", "scam", "unsure"] as const satisfies readonly TriageVerdict["verdict"][];
export const QUESTIONS = ["none", "tonkfun", "other"] as const satisfies readonly TriageVerdict["question"][];
export const NEEDS_HUMAN: readonly TriageVerdict["needs_human"][] = ["none", ...ESCALATIONS];
export const LANGUAGES: readonly TriageVerdict["language"][] = [...LOCALES.map((l) => l.code), "other"];

/** The checked message's first 1,000 characters. */
export const MAX_TEXT = 1_000;
/** At most this many of a message's link domains, and of each official list. */
const MAX_DOMAINS = 10;
const MAX_NAMES = 30;
const STANDINGS: readonly TriageInput["standing"][] = ["new", "member", "trusted"];

function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) frozen(inner);
    Object.freeze(value);
  }
  return value;
}

const choice = (values: readonly string[]) => ({ type: "string", enum: [...values] });

/**
 * The verdict as structured output asks for it. Every field is required and
 * no other is allowed; there are no length limits, which structured outputs
 * don't support (parseVerdict clips the reason instead). Frozen: its bytes
 * key the compiled grammar and the cache.
 */
export const TRIAGE_SCHEMA: Record<string, unknown> = frozen({
  type: "object",
  properties: {
    reason: { type: "string" },
    verdict: choice(VERDICTS),
    category: choice(TRIAGE_CATEGORIES),
    question: choice(QUESTIONS),
    needs_human: choice(NEEDS_HUMAN),
    dm_scam_mention: { type: "boolean" },
    language: choice(LANGUAGES),
  },
  required: [...VERDICT_FIELDS],
  additionalProperties: false,
});

const NAME = /^[a-z0-9_]{1,64}$/;
const HOST = /^(?=.{1,253}$)[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;

/** The site's origin (scheme, host and port only), or "none" for anything that isn't a plain http(s) address. */
function siteOf(site: unknown): string {
  try {
    const url = new URL(typeof site === "string" ? site.trim() : "");
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.origin : "none";
  } catch {
    return "none";
  }
}

/** Config values as the prompt shows them: lower case, well formed, unique and sorted, so the text never depends on their order. */
function tidy(values: unknown, valid: RegExp, strip: RegExp | null = null): string[] {
  const list: unknown[] = Array.isArray(values) ? values : [];
  const clean = list.flatMap((v) => (typeof v === "string" ? [v.trim().toLowerCase().replace(strip ?? /^$/, "")] : [])).filter((v) => valid.test(v));
  return [...new Set(clean)].sort().slice(0, MAX_NAMES);
}

const names = (values: unknown) => tidy(values, NAME, /^@/);
const hosts = (values: unknown) => tidy(values, HOST);
const joined = (items: readonly string[], prefix: string) => (items.length > 0 ? items.map((item) => `${prefix}${item}`).join(", ") : "none");

/** The official accounts and the allow-list, from the config and Telegram: never from a message. */
function accounts(official: OfficialAccounts, allow: AllowList): string {
  return [
    "Official accounts, tonkfun.fun's own. Anything else that claims to be tonkfun.fun, its team, its support or its bot is not, however close the name:",
    `- the bot: ${joined(names(official.bot), "@")}`,
    `- the channel: ${joined(names(official.channel ? [official.channel] : []), "@")}`,
    `- the community groups: ${joined(names(official.groups), "@")}`,
    `- on X: ${joined(names(official.x), "@")}`,
    `- the site: ${siteOf(official.site)}`,
    `Links members may post freely: ${joined(hosts(allow.domains), "")} and their subdomains; Telegram links to ${joined(names(allow.telegram), "t.me/")}; X links to ${joined(names(allow.x), "x.com/")}. Other links aren't bad in themselves: judge the message.`,
  ].join("\n");
}

/** A verdict as JSON in the schema's field order. */
const inOrder = (v: TriageVerdict) => JSON.stringify(Object.fromEntries(VERDICT_FIELDS.map((field) => [field, v[field]])));

const EXAMPLES = [
  "Examples, each a message (standing and text only) and its verdict:",
  ...TRIAGE_EXAMPLES.map(({ message, verdict }) => `${JSON.stringify({ standing: message.standing, text: message.text })}\n→ ${inOrder(verdict)}`),
].join("\n");

/**
 * The check's system prompt: the same bytes for the same accounts, however
 * the lists are ordered, so the 1-hour cache keeps hitting. It holds no
 * date, ID or anything from a message.
 */
export function triageSystem(official: OfficialAccounts, allow: AllowList): string {
  return [...TRIAGE_INTRO, "", ...TRIAGE_FIELDS, "", accounts(official, allow), "", EXAMPLES, "", RULES_HOLD].join("\n");
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(99, Math.floor(n)) : 0);

/** A message's link domains as sent: strings with no spaces, controls or invisible marks, at most 253 characters each, unique, at most 10. */
function domainsOf(values: unknown): string[] {
  const list: unknown[] = Array.isArray(values) ? values : [];
  const clean = list.flatMap((d) => (typeof d === "string" ? [clip(d.trim().toLowerCase(), 253)] : [])).filter((d) => d !== "" && !/[\s\p{Cc}\p{Cf}]/u.test(d));
  return [...new Set(clean)].slice(0, MAX_DOMAINS);
}

/**
 * The user turn: TriageInput's fields only, keys sorted, as JSON. The text
 * loses invisible characters, then is masked again (masking twice only ever
 * hides more, and a key split by zero-width spaces is whole again by then, so
 * a caller that missed one can't leak it) and cut to 1,000 characters;
 * anything else a caller passes, such as an ID or a name, is left out.
 */
export function triageUserContent(input: TriageInput): string {
  const text = typeof input.text === "string" ? visibleText(input.text) : "";
  return JSON.stringify({
    addresses: count(input.addresses),
    appLang: isLocale(input.appLang) ? input.appLang : DEFAULT_LOCALE,
    domains: domainsOf(input.domains),
    edited: input.edited === true,
    forwarded: input.forwarded === true,
    handles: count(input.handles),
    replyToBot: input.replyToBot === true,
    standing: STANDINGS.includes(input.standing) ? input.standing : "member",
    text: clip(maskForModel(text), MAX_TEXT),
  });
}
