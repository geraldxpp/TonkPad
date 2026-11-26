import { isLocale, LOCALES, type Locale } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import { ESCALATIONS } from "../community/types";
import { findAddress, isTokenAddress } from "../text";
import { type AnswerOutput, LINK_KEYS, type LinkKey } from "./types";

/**
 * The answer as structured output asks for it (prompts/15-community-agent.md,
 * Request settings), and the model's JSON read back. The schema leaves out
 * lengths and counts, which structured outputs don't support: parseAnswer
 * clips the reply and the note and keeps at most 3 links instead.
 */

/** The fields in the schema's order: the language, whether the facts answer it, then the reply and what goes with it. */
export const ANSWER_FIELDS = ["language", "answered", "reply", "links", "token", "escalate", "admin_note"] as const satisfies readonly (keyof AnswerOutput)[];
export const ESCALATE_VALUES: readonly AnswerOutput["escalate"][] = ["none", ...ESCALATIONS];

/** The most of a reply kept (the gate cuts it again, to 700 or 1,000), of an admin note, and of link keys. */
export const MAX_REPLY = 1_200;
export const MAX_NOTE = 200;
const MAX_LINKS = 3;

function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) frozen(inner);
    Object.freeze(value);
  }
  return value;
}

const choice = (values: readonly string[]) => ({ type: "string", enum: [...values] });

/**
 * Every field required, no other allowed. Frozen: its bytes key the
 * compiled grammar and sit in every request.
 */
export const ANSWER_SCHEMA: Record<string, unknown> = frozen({
  type: "object",
  properties: {
    language: choice(LOCALES.map((l) => l.code)),
    answered: { type: "boolean" },
    reply: { type: "string" },
    links: { type: "array", items: choice(LINK_KEYS) },
    token: { type: "string" },
    escalate: choice(ESCALATE_VALUES),
    admin_note: { type: "string" },
  },
  required: [...ANSWER_FIELDS],
  additionalProperties: false,
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isLinkKey = (value: unknown): value is LinkKey => typeof value === "string" && (LINK_KEYS as readonly string[]).includes(value);
const isEscalate = (value: unknown): value is AnswerOutput["escalate"] => typeof value === "string" && (ESCALATE_VALUES as readonly string[]).includes(value);

/** Known link keys only, each once, at most 3, in the model's order. */
function linksOf(values: readonly unknown[]): LinkKey[] {
  const out: LinkKey[] = [];
  for (const value of values) if (out.length < MAX_LINKS && isLinkKey(value) && !out.includes(value)) out.push(value);
  return out;
}

/** One token address and nothing else, as findAddress writes it (EVM lower-cased), or null. */
export function addressOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  const found = findAddress(text);
  if (!found || !isTokenAddress(found)) return null;
  return (/^0x/i.test(text) ? text.toLowerCase() : text) === found ? found : null;
}

/**
 * The answer from the model's text: JSON with exactly the schema's fields,
 * each of its type, and an escalation the schema knows; anything else is
 * null (the caller declines it as invalid). The language falls back to
 * `fallbackLang` when it isn't one of the site's 12, unknown link keys are
 * dropped, a token that isn't one address becomes "", the reply is cut to
 * 1,200 characters and the admin note to one line of 200.
 */
export function parseAnswer(text: string, fallbackLang: Locale): AnswerOutput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== ANSWER_FIELDS.length || !ANSWER_FIELDS.every((field) => keys.includes(field))) return null;
  const { reply, language, links, token, escalate, admin_note, answered } = raw;
  if (typeof reply !== "string" || typeof token !== "string" || typeof admin_note !== "string" || typeof answered !== "boolean") return null;
  if (!Array.isArray(links) || !isEscalate(escalate)) return null;
  const fallback: Locale = isLocale(fallbackLang) ? fallbackLang : "en";
  return {
    reply: clip(reply.trim(), MAX_REPLY),
    language: typeof language === "string" && isLocale(language) ? language : fallback,
    links: linksOf(links),
    token: addressOf(token) ?? "",
    escalate,
    admin_note: clip(visibleText(admin_note), MAX_NOTE).trimEnd(),
    answered,
  };
}
