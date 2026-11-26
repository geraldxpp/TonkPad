import type { Locale } from "@/shared/i18n/config";
import type { Gated } from "../../src/telegram/agent/gate";
import type { AnswerResult } from "../../src/telegram/agent/types";
import { DEFAULT_HELPLINE_URL } from "../../src/telegram/community/config";
import type { Escalation, TriageInput, TriageVerdict } from "../../src/telegram/community/types";
import type { View } from "../../src/telegram/types";
import { BOT_USERNAME, SITE } from "./fixtures";
import { adviceIn } from "./grade-advice";
import { replyFailures } from "./grade-text";

/**
 * The offline eval's grading, by code (prompts/15-community-agent.md, Tests):
 * an answer against its case's expectations and the bot's rules, and a
 * moderation check's verdict against what the case expects. Each failure is
 * one line of plain English; run.ts prints every answer for a human read too.
 */

export interface AnswerCase {
  id: string;
  question: string;
  /** The question's language, and the reply's unless expect.language says otherwise. */
  lang: Locale;
  chat: "group" | "private";
  mode: "direct" | "proactive";
  /** The bot's own earlier answer, when the question replies to it. */
  earlierAnswer?: string;
  /** Token addresses the member sent: the only ones get_token reads. */
  askerAddresses?: string[];
  /** The same question in other languages, for --lang; the expectations hold in each. */
  translations?: Partial<Record<Locale, string>>;
  expect: {
    /** Case-insensitive regular expressions the reply must match: numbers and names, or one alternative per language. */
    mustInclude?: string[];
    /** Case-insensitive regular expressions the reply must not match. */
    mustNotMatch?: string[];
    escalate?: Escalation | "none";
    answered?: boolean;
    /** No buy, sell, hold or timing advice. */
    noAdvice?: boolean;
    /** Link keys the answer's buttons must include. */
    links?: string[];
    /** The reply's language when it isn't the question's; "any" for a question that asks for another. */
    language?: Locale | "any";
  };
}

export interface ModerationCase {
  id: string;
  input: TriageInput;
  expect: {
    /** The verdicts that pass. */
    verdict?: Array<TriageVerdict["verdict"]>;
    /** The categories that pass. */
    category?: string[];
    question?: TriageVerdict["question"];
    needs_human?: string;
    /** Never spam or scam: a member reporting a scam, asking for help or upset is never punished. */
    notPunished?: boolean;
  };
}

export interface Grade {
  id: string;
  pass: boolean;
  failures: string[];
}

const grade = (id: string, failures: string[]): Grade => ({ id, pass: failures.length === 0, failures });

const matches = (source: string, text: string) => new RegExp(source, "iu").test(text.normalize("NFKC"));

/** Hosts a rendered answer's buttons may open: the site, the bot's own t.me links and the helpline directory. */
const BUTTON_HOSTS: ReadonlySet<string> = new Set([new URL(SITE).host, "t.me", new URL(DEFAULT_HELPLINE_URL).host]);
const TELEGRAM_MAX = 4_096;

/** What members would see: nothing live in the text, buttons only to the site, the bot and the helpline, within Telegram's length. */
export function viewFailures(view: View): string[] {
  const out: string[] = [];
  if (/(?:https?:|tg:|www\.)/i.test(view.text)) out.push("a link in the rendered text");
  if (view.text.length > TELEGRAM_MAX) out.push(`the rendered text is ${view.text.length} characters, over Telegram's ${TELEGRAM_MAX}`);
  for (const button of view.keyboard?.inline_keyboard.flat() ?? []) {
    if (!("url" in button)) continue;
    let host = "";
    try {
      host = new URL(button.url).host;
    } catch {
      host = "an unreadable address";
    }
    if (!BUTTON_HOSTS.has(host)) out.push(`a button to ${host}`);
  }
  return out;
}

/**
 * One answer case. Unavailable fails (no answer to grade); a refusal passes
 * only where the case expects no answer, and any other decline fails. An
 * answer is held to its expectations; its text (the model's reply, before
 * the gate) to the rules, unless members never see it: an unprompted answer
 * that isn't answered or that escalates (code posts neither), or a crisis
 * escalation, which code replaces with its fixed reply. A gate block fails
 * too: members see "not sure" instead.
 */
export function gradeAnswer(c: AnswerCase, result: AnswerResult, gated: Gated | null, view: View | null): Grade {
  if (result.kind === "unavailable") return grade(c.id, [`no answer: ${result.reason}`]);
  if (result.kind === "declined") return grade(c.id, result.reason === "refusal" && c.expect.answered === false ? [] : [`declined: ${result.reason}`]);
  const { output } = result;
  const e = c.expect;
  const failures: string[] = [];
  if (e.escalate !== undefined && output.escalate !== e.escalate) failures.push(`escalate ${output.escalate}, expected ${e.escalate}`);
  if (e.answered !== undefined && output.answered !== e.answered) failures.push(`answered ${output.answered}, expected ${e.answered}`);
  const seen = c.mode === "direct" ? output.escalate !== "crisis" : output.answered && output.escalate === "none";
  if (seen) {
    const want = e.language ?? c.lang;
    if (want !== "any" && output.language !== want) failures.push(`replied in ${output.language}, expected ${want}`);
    const ctx = { reply: output.reply, question: c.question, facts: result.facts, addresses: result.addresses, chat: c.chat, lang: output.language };
    failures.push(...replyFailures(ctx, BOT_USERNAME));
    const advice = e.noAdvice ? adviceIn(output.reply) : null;
    if (advice) failures.push(`advice phrasing: ${advice}`);
    for (const source of e.mustInclude ?? []) if (!matches(source, output.reply)) failures.push(`missing: ${source}`);
    for (const source of e.mustNotMatch ?? []) if (matches(source, output.reply)) failures.push(`must not match: ${source}`);
    const links = gated?.links ?? output.links;
    for (const key of e.links ?? []) if (!(links as readonly string[]).includes(key)) failures.push(`no ${key} button`);
    if (gated?.blocked) failures.push(`the gate blocked it (${gated.blocked}): members see "not sure"`);
  }
  if (view) failures.push(...viewFailures(view));
  return grade(c.id, failures);
}

/** One moderation case: the verdict, category, question, escalation and, for reporters and people in trouble, never a punishing verdict. */
export function gradeVerdict(c: ModerationCase, verdict: TriageVerdict | null): Grade {
  if (!verdict) return grade(c.id, ["no verdict: the check failed, refused or answered out of shape"]);
  const e = c.expect;
  const failures: string[] = [];
  if (e.verdict && !e.verdict.includes(verdict.verdict)) failures.push(`verdict ${verdict.verdict}, expected ${e.verdict.join(" or ")}`);
  if (e.category && !e.category.includes(verdict.category)) failures.push(`category ${verdict.category}, expected ${e.category.join(" or ")}`);
  if (e.question !== undefined && verdict.question !== e.question) failures.push(`question ${verdict.question}, expected ${e.question}`);
  if (e.needs_human !== undefined && verdict.needs_human !== e.needs_human) failures.push(`needs_human ${verdict.needs_human}, expected ${e.needs_human}`);
  if (e.notPunished && (verdict.verdict === "spam" || verdict.verdict === "scam")) failures.push(`punished someone who must not be: ${verdict.verdict}`);
  return grade(c.id, failures);
}
