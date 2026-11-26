import type Anthropic from "@anthropic-ai/sdk";
import { isLocale, type Locale } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import type { AnswerModel, Budget, ClaudeClient } from "../claude/types";
import type { OfficialAccounts } from "../community/types";
import { maskForModel } from "../mod/secrets";
import { ANSWER_SETTINGS, attempt, answerParams, quietly, retryWait, sleep } from "./answer-request";
import { answerContext, answerSystem, askableOf, coreText, glossaryText } from "./prompt";
import { parseAnswer } from "./schema";
import { factsOf, runTool, type ToolRun } from "./tools";
import type { AgentData, AnswerRequest, AnswerResult, Pack, PackSource, ToolToken } from "./types";

export { ANSWER_SETTINGS, type AnswerSettings } from "./answer-request";

/**
 * The answer loop (prompts/15-community-agent.md, Request settings): a
 * manual tool loop of at most 3 requests, retries included, within its
 * model's deadline (45 seconds on Haiku 5.5, 60 on Sonnet 5.5 and Opus
 * 5.5); a timed-out request is never retried. Each request is reserved and
 * charged at its model's prices (answer-request.ts). The
 * stop reason is read before anything else: a refusal or a max_tokens stop
 * is declined without reading the content; a tool round passes the
 * assistant's whole content back unchanged (thinking blocks included) and
 * every result in one user message; a finished reply is read by its first
 * text block. Nothing is logged here.
 */

export interface AnswerDeps {
  client: ClaudeClient;
  budget: Budget;
  pack: PackSource;
  data: AgentData;
  official: OfficialAccounts;
  now: () => number;
  /** The model answers run on (TELEGRAM_AI_ANSWER_MODEL): its settings, deadline and prices. */
  model: AnswerModel;
}

const MAX_QUESTION = 600;
const MAX_EARLIER = 1_000;
/** Tool calls run from one reply; any more get an error result. */
const MAX_TOOL_CALLS = 6;
const FOLLOW_UP = "The member is following up on your earlier answer.";
const INVALID: AnswerResult = { kind: "declined", reason: "invalid" };
const TOO_MANY: ToolRun = { content: JSON.stringify({ error: "Too many tool calls at once." }), isError: true, addresses: [], token: null };

/**
 * The conversation: on a follow-up, the bot's earlier answer as an
 * assistant turn after a fixed user line; then the question (its words only
 * ever here, cleaned, masked again and cut to 600 characters); then the
 * system message from code. Null for an empty question.
 */
function opening(req: AnswerRequest): Anthropic.MessageParam[] | null {
  const question = clip(maskForModel(visibleText(typeof req.question === "string" ? req.question : "")), MAX_QUESTION).trim();
  if (question === "") return null;
  const earlier = typeof req.earlierAnswer === "string" ? clip(req.earlierAnswer.trim(), MAX_EARLIER).trim() : "";
  const followUp: Anthropic.MessageParam[] = earlier ? [{ role: "user", content: FOLLOW_UP }, { role: "assistant", content: earlier }] : [];
  return [...followUp, { role: "user", content: question }, { role: "system", content: answerContext(req) }];
}

/** Runs every tool_use block of a reply (at most 6; the rest get an error result), each answered in order. Null when a block has no ID to answer. */
async function toolRound(message: Anthropic.Message, data: AgentData, askable: ReadonlySet<string>): Promise<{ runs: ToolRun[]; results: Anthropic.ToolResultBlockParam[] } | null> {
  const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (uses.length === 0 || uses.some((u) => typeof u.id !== "string" || u.id === "")) return null;
  const runs = await Promise.all(uses.map((u, i) => (i < MAX_TOOL_CALLS ? runTool(u.name, u.input, data, askable) : Promise.resolve(TOO_MANY))));
  const results = uses.map((u, i): Anthropic.ToolResultBlockParam => ({ type: "tool_result", tool_use_id: u.id, content: runs[i].content, ...(runs[i].isError ? { is_error: true } : {}) }));
  return { runs, results };
}

/**
 * A finished reply: the first text block, parsed. The facts the gate checks
 * numbers against are the core with the site's lines, the glossary sent,
 * and every tool result without a creator's own text; the addresses an
 * answer may show are the pack's and the tools'; the token is the last one
 * read.
 */
function finish(message: Anthropic.Message, lang: Locale, pack: Pack, runs: readonly ToolRun[]): AnswerResult {
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const output = block && typeof block.text === "string" ? parseAnswer(block.text, lang) : null;
  if (!output) return INVALID;
  const facts = [coreText(pack), glossaryText(pack, lang) ?? "", ...runs.map(factsOf)].filter((text) => text !== "").join("\n\n");
  const addresses = [...new Set([...pack.addresses, ...runs.flatMap((r) => r.addresses)])];
  const token = runs.reduce<ToolToken | null>((last, r) => r.token ?? last, null);
  return { kind: "answer", output, facts, addresses, token };
}

async function answerLoop(req: AnswerRequest, deps: AnswerDeps): Promise<AnswerResult> {
  const settings = ANSWER_SETTINGS[deps.model];
  const deadline = deps.now() + settings.deadlineMs;
  const lang: Locale = isLocale(req.lang) ? req.lang : "en";
  const pack = deps.pack.current();
  const system = answerSystem(pack, lang, deps.official);
  const messages = opening(req);
  if (!messages) return INVALID;
  const askable = new Set(askableOf(req));
  const runs: ToolRun[] = [];
  let retried = false;
  for (let sent = 0; sent < settings.maxRequests; sent += 1) {
    const result = await attempt(answerParams(system, messages, req.userCode, deps.model), req.lane, deadline, deps);
    if (result.kind !== "sent") return { kind: "unavailable", reason: result.kind === "late" ? "timeout" : result.kind };
    const { outcome } = result;
    if (!outcome.ok) {
      const wait = retried || sent + 1 >= settings.maxRequests ? null : retryWait(outcome, deps.now(), deadline, settings.minRequestMs);
      if (wait !== null) {
        retried = true;
        if (wait > 0) await sleep(wait);
        continue;
      }
      // The lane says whose pause it is: an answer's failures never pause moderation's checks.
      quietly(() => deps.budget.failed(outcome.failure, outcome.retryAfterMs, deps.now(), req.lane));
      return { kind: "unavailable", reason: outcome.failure === "timeout" ? "timeout" : "error" };
    }
    const { message } = outcome;
    if (message.stop_reason === "refusal") {
      quietly(() => deps.budget.refused(req.lane));
      return { kind: "declined", reason: "refusal" };
    }
    if (message.stop_reason === "max_tokens") return { kind: "declined", reason: "max_tokens" };
    if (message.stop_reason === "end_turn") return finish(message, lang, pack, runs);
    // Any other stop, or a tool call with no request left to answer it: no answer.
    if (message.stop_reason !== "tool_use" || sent + 1 >= settings.maxRequests) return INVALID;
    const round = await toolRound(message, deps.data, askable);
    if (!round) return INVALID;
    runs.push(...round.runs);
    messages.push({ role: "assistant", content: message.content }, { role: "user", content: round.results });
  }
  return INVALID;
}

/**
 * Answers one question, or says why not: declined (a refusal, counted in
 * the lane; a max_tokens stop; a reply that isn't the schema's JSON) or
 * unavailable (no budget, an error, a timeout, a request too long). Never
 * rejects.
 */
export async function answerQuestion(req: AnswerRequest, deps: AnswerDeps): Promise<AnswerResult> {
  try {
    return await answerLoop(req, deps);
  } catch {
    return { kind: "unavailable", reason: "error" };
  }
}
