import { answerQuestion } from "../../src/telegram/agent/answer";
import { gateAnswer, type Gated } from "../../src/telegram/agent/gate";
import { officialNames } from "../../src/telegram/agent/gate-handles";
import { answerView, crisisView, scoreLine } from "../../src/telegram/agent/render";
import type { AgentData, AnswerRequest, AnswerResult, PackSource } from "../../src/telegram/agent/types";
import type { AnswerModel, Budget, ClaudeClient, Lane } from "../../src/telegram/claude/types";
import { DEFAULT_HELPLINE_URL } from "../../src/telegram/community/config";
import type { AllowList, OfficialAccounts, TriageInput, TriageVerdict } from "../../src/telegram/community/types";
import { BOT_DICTIONARIES } from "../../src/telegram/i18n";
import { communityWords } from "../../src/telegram/i18n/community";
import { allAddresses } from "../../src/telegram/mod/rules";
import { triageMessage } from "../../src/telegram/mod/triage";
import type { View } from "../../src/telegram/types";
import { BOT_USERNAME, LEVEL_WORDS, SITE } from "./fixtures";
import { type AnswerCase, type Grade, gradeAnswer, gradeVerdict, type ModerationCase } from "./grade";
import { type CallRecord, type Effort, metered } from "./run-meter";

/**
 * One case through the bot's real code (run.ts): an answer through
 * answerQuestion, gateAnswer and answerView; an unprompted candidate through
 * Haiku's check first, then the answer in unprompted mode; a moderation
 * message through triageMessage. Each case gets its own metered client, so
 * its calls, tokens and time are its own even when cases run side by side.
 */

export interface EvalEnv {
  client: ClaudeClient;
  budget: Budget;
  /** The answers' model (--model or TELEGRAM_AI_ANSWER_MODEL); checks run on Haiku 5.5 whatever it is. */
  model: AnswerModel;
  pack: PackSource;
  data: AgentData;
  official: OfficialAccounts;
  allow: AllowList;
  /** The eval's own pseudonymous metadata.user_id, so Anthropic sees one asker. */
  userCode: string;
  /** Today's UTC date, for the answer's system message. */
  date: string;
}

export interface AnswerRun {
  c: AnswerCase;
  result: AnswerResult;
  gated: Gated | null;
  view: View | null;
  /** An unprompted candidate's check (null when it failed); undefined for a direct question. */
  check?: TriageVerdict | null;
  grade: Grade;
  /** The answer's own time, the check's excluded. */
  ms: number;
  calls: CallRecord[];
}

export interface ModerationRun {
  c: ModerationCase;
  verdict: TriageVerdict | null;
  grade: Grade;
  ms: number;
  calls: CallRecord[];
}

const laneOf = (c: AnswerCase): Lane => (c.mode === "proactive" ? "proactive" : c.chat === "private" ? "private" : "group");
const addressKey = (address: string) => (/^0x/i.test(address) ? address.toLowerCase() : address);
/** The addresses the member sent: the case's own list, else every address in the question, as the pipeline finds them. */
const askerOf = (c: AnswerCase) => c.askerAddresses ?? allAddresses(c.question);

function requestOf(c: AnswerCase, env: EvalEnv): AnswerRequest {
  return {
    question: c.question,
    earlierAnswer: c.earlierAnswer ?? null,
    cardAddress: null,
    askerAddresses: askerOf(c),
    lang: c.lang,
    chat: c.chat,
    mode: c.mode,
    lane: laneOf(c),
    date: env.date,
    userCode: env.userCode,
  };
}

/**
 * What members would see: the gated answer in its frame, with the score line
 * code adds when the answer is about the token the tool read, and a token
 * button in a private chat for an address the member sent; a crisis
 * escalation gets the fixed crisis reply instead. Nothing for a decline or a
 * failure, nor for an unprompted answer that isn't answered or escalates.
 * The gate knows the official accounts the answer loop was given, as the
 * bot's does (community/qa-answer.ts), so an answer may name them.
 * The pipeline's own extra lines (the DM warning, "I've let the team know")
 * aren't added here: the printed escalation says which would follow.
 */
function shown(c: AnswerCase, result: AnswerResult, official: OfficialAccounts): { gated: Gated | null; view: View | null } {
  if (result.kind !== "answer") return { gated: null, view: null };
  const { output, token } = result;
  if (c.mode === "proactive" && (!output.answered || output.escalate !== "none")) return { gated: null, view: null };
  if (output.escalate === "crisis") return { gated: null, view: crisisView(communityWords(output.language), DEFAULT_HELPLINE_URL) };
  const placeholder = communityWords(output.language).answer.unverifiedAddress;
  const gated = gateAnswer({
    output, facts: result.facts, allowedAddresses: new Set(result.addresses), chat: c.chat, placeholder, levelWords: LEVEL_WORDS, official: officialNames(official),
  });
  const words = communityWords(gated.lang);
  const about = addressKey(output.token.trim());
  const onToken = token !== null && (about === "" || about === addressKey(token.address));
  const score = token && onToken ? scoreLine(token, words, BOT_DICTIONARIES[gated.lang].levels[token.level]) : null;
  const tokenButton = c.chat === "private" && about !== "" && askerOf(c).map(addressKey).includes(about) ? about : null;
  const view = answerView(gated, words, SITE, BOT_USERNAME, { shared: c.chat === "group", lang: gated.lang, scoreLine: score, tokenButton, dmWarning: false, extra: null, shareData: null });
  return { gated, view };
}

/** An unprompted candidate as the pipeline hands it to the check: a member's plain question, no ID or name. */
const candidateInput = (c: AnswerCase): TriageInput => ({
  text: c.question,
  edited: false,
  forwarded: false,
  standing: "member",
  domains: [],
  handles: 0,
  addresses: askerOf(c).length,
  replyToBot: false,
  appLang: c.lang,
});

/** Whether the check makes the message an unprompted candidate: a question about tonkfun.fun, and not spam or a scam. */
const candidate = (v: TriageVerdict | null) => v !== null && v.question === "tonkfun" && v.verdict !== "spam" && v.verdict !== "scam";

/** A case the eval itself failed on (its own code threw): graded as a failure, so the other cases still run. */
const broken = (id: string, error: unknown): Grade => ({ id, pass: false, failures: [`the eval failed on this case: ${error instanceof Error ? error.message : "an unexpected error"}`] });

/** One answer case, or one unprompted candidate (the check first). Never rejects. */
export async function runAnswer(c: AnswerCase, env: EvalEnv, effort: Effort | null): Promise<AnswerRun> {
  const client = metered(env.client, effort);
  try {
    return await answerCase(c, env, client);
  } catch (error) {
    return { c, result: { kind: "unavailable", reason: "error" }, gated: null, view: null, grade: broken(c.id, error), ms: 0, calls: client.calls };
  }
}

async function answerCase(c: AnswerCase, env: EvalEnv, client: ReturnType<typeof metered>): Promise<AnswerRun> {
  const now = () => Date.now();
  const check = c.mode === "proactive" ? await triageMessage(candidateInput(c), { client, budget: env.budget, official: env.official, allow: env.allow, now }, env.userCode) : undefined;
  const started = Date.now();
  const result = await answerQuestion(requestOf(c, env), { client, budget: env.budget, pack: env.pack, data: env.data, official: env.official, now, model: env.model });
  const ms = Date.now() - started;
  const { gated, view } = shown(c, result, env.official);
  let grade = gradeAnswer(c, result, gated, view);
  if (check !== undefined && c.expect.answered === true && !candidate(check)) {
    const why = check ? `verdict ${check.verdict}, question ${check.question}` : "no verdict";
    grade = { ...grade, pass: false, failures: [...grade.failures, `the check wouldn't make it a candidate (${why})`] };
  }
  return { c, result, gated, view, check, grade, ms, calls: client.calls };
}

/** One moderation message through Haiku's check. Never rejects. */
export async function runModeration(c: ModerationCase, env: EvalEnv): Promise<ModerationRun> {
  const client = metered(env.client);
  const started = Date.now();
  try {
    const verdict = await triageMessage(c.input, { client, budget: env.budget, official: env.official, allow: env.allow, now: () => Date.now() }, env.userCode);
    return { c, verdict, grade: gradeVerdict(c, verdict), ms: Date.now() - started, calls: client.calls };
  } catch (error) {
    return { c, verdict: null, grade: broken(c.id, error), ms: Date.now() - started, calls: client.calls };
  }
}

/** A case asked in another language: the translated question, the reply expected in that language. Null without a translation. */
export function inLanguage(c: AnswerCase, lang: AnswerCase["lang"]): AnswerCase | null {
  const question = c.translations?.[lang];
  if (!question) return null;
  const language = c.expect.language === "any" ? "any" : lang;
  return { ...c, question, lang, expect: { ...c.expect, language } };
}
