import type Anthropic from "@anthropic-ai/sdk";
import type { ChatId, UserId } from "../community/types";

/**
 * The bot's calls to Claude through Anthropic's Messages API. Only
 * claude/client.ts imports the SDK as a value; everything else codes against
 * these types (the SDK's own, imported as types only).
 */

/** Moderation checks always run on Claude Haiku 5.5, whatever answers run on. Model IDs here are exact: no date suffix, no alias. */
export const TRIAGE_MODEL = "claude-haiku-5-5";

/** The models answers may run on (TELEGRAM_AI_ANSWER_MODEL, community/config.ts). */
export const ANSWER_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] as const;
export type AnswerModel = (typeof ANSWER_MODELS)[number];
/** Answers run on Claude Sonnet 5.5 unless TELEGRAM_AI_ANSWER_MODEL picks another. */
export const DEFAULT_ANSWER_MODEL: AnswerModel = "claude-sonnet-5-5";

/** Any model the bot calls: the answers' or the checks'. Each has a rate card (claude/prices.ts). */
export type ClaudeModel = AnswerModel | typeof TRIAGE_MODEL;
export const isClaudeModel = (v: unknown): v is ClaudeModel => v === TRIAGE_MODEL || (ANSWER_MODELS as readonly unknown[]).includes(v);

/** An answer (asked, unprompted or private) or a moderation check. */
export type CallKind = "answer" | "triage";

/** The day's budget is split in lanes, so asking questions can't use up moderation's share. */
export const LANES = ["triage", "group", "proactive", "private"] as const;
export type Lane = (typeof LANES)[number];

export interface ClaudeRequest {
  kind: CallKind;
  lane: Lane;
  /** The request as sent (model, max_tokens, system, messages, …); never temperature, top_p, top_k, a prefill or fallbacks. */
  params: Anthropic.MessageCreateParamsNonStreaming;
  /** This request's own timeout, ms. */
  timeoutMs: number;
}

/** Why a request failed, by what the API or the network said (claude/client.ts maps errors to these). */
export type ClaudeFailure =
  | "timeout"
  | "network"
  | "rate_limited"
  | "ramp"
  | "overloaded"
  | "server"
  | "auth"
  | "billing"
  | "not_found"
  | "bad_request"
  | "unknown";

/** A network failure's type when the connection failed before any of the request was written (claude/client-unsent.ts): never billed. */
export const UNSENT = "unsent";

/**
 * A request's result. A failure carries the API's error type (such as
 * "rate_limit_error"; for a network failure, UNSENT when the connection
 * failed before any of the request was written), the HTTP status and
 * Anthropic's retry-after, never the error's message (which the worker must
 * not log). Pass `type` on to Budget.commit, which releases an unsent
 * request's reservation.
 */
export type ClaudeOutcome =
  | { ok: true; message: Anthropic.Message }
  | { ok: false; failure: ClaudeFailure; type: string | null; status: number | null; retryAfterMs: number | null };

export interface ClaudeClient {
  /** One request, no retries inside. Never rejects: every error comes back as a failure. */
  create(request: ClaudeRequest): Promise<ClaudeOutcome>;
  /** The request's input tokens (the eval's --count-tokens), or null when the count failed. */
  countTokens(params: Anthropic.MessageCountTokensParams): Promise<number | null>;
}

export type Usage = Anthropic.Message["usage"];

/** A reservation of a request's worst-case cost, charged with its real cost once it ends. */
export interface Ticket {
  id: number;
  lane: Lane;
  worstUsd: number;
  /** The model the request runs on: its real cost is charged at this model's prices. */
  model: ClaudeModel;
}

export interface BudgetStatus {
  /** The UTC day, "YYYY-MM-DD". */
  day: string;
  spentUsd: number;
  capUsd: number;
  lanes: Record<Lane, { spentUsd: number; capUsd: number; calls: number }>;
  /** Whether every model call may run right now: false while either kind's breaker is open, though the other kind's calls still run. */
  on: boolean;
  /** Why not: the day's cap, a breaker after repeated errors or a bad request, a refused key, a ramp limit's wait, billing, a missing model or workspace, an admin's /ai off, or AI switched off in the config. */
  reason: "cap" | "circuit" | "auth" | "ramp" | "billing" | "not_found" | "admin" | "off" | null;
  /** When the pause ends (ms), for the cap, a breaker, a refused key and a ramp limit's wait. */
  until: number | null;
  refusals: number;
  errors: number;
}

/** The day's AI spending, by lane (claude/budget.ts). */
export interface Budget {
  /** Whether a request in this lane could be reserved now (a quick check before queueing work). */
  available(lane: Lane, now: number): boolean;
  /**
   * Reserves a request's worst case on `model`, whose prices its commit
   * charges; null when it doesn't fit (the lane, the answer lanes together
   * or the day, with what is spent and in flight, would pass its cap), AI is
   * off, or the model has no rate card. A refusal closes nothing and sends
   * no event: gates close only from commit().
   */
  reserve(lane: Lane, worstUsd: number, now: number, model: ClaudeModel): Ticket | null;
  /**
   * Settles one request: charges the real cost from usage at the ticket's model's prices, or settles a
   * failure (released when the API answered with a status, or when `type`
   * is the client's "unsent", a connection that never reached Anthropic;
   * kept for a timeout or any other network failure, which may have been
   * billed). It also tells the breaker of the ticket's kind of call (checks
   * or answers) how the request ended: a reply, or a failure counted toward
   * that kind's own pause; and closes, each with its event, the 80% mark,
   * the ticket's lane and the day's cap once committed spending reaches
   * them. Returns the USD charged.
   */
  commit(ticket: Ticket, usage: Usage | null, failure: ClaudeFailure | null, now: number, type?: string | null): number;
  /**
   * A call that failed in the end: counted for /status. A refused key,
   * billing or a missing model pauses or stops every call; a ramp limit
   * makes the lane's kind of call (checks, or answers) wait its
   * retry-after, or every call when no lane is given.
   */
  failed(failure: ClaudeFailure, retryAfterMs: number | null, now: number, lane?: Lane | null): void;
  /** Counts a refusal (stop_reason "refusal") in this lane. */
  refused(lane: Lane): void;
  /** An owner's /ai on or off; off is saved and survives restarts. */
  setOn(on: boolean, now: number): void;
  status(now: number): BudgetStatus;
}

/** Why an answer can't be given now: the asker's own pace, their cooldown after a refusal, the group's pace, private chats' pace, or everyone's. */
export type AnswerLimit = "ok" | "user" | "cooldown" | "chat" | "private" | "global";

/**
 * Pace limits kept in memory (claude/limits.ts): each check that returns
 * true or "ok" also counts that use.
 */
export interface AiLimits {
  /** An answer for this person, in this group (null for a private chat). */
  answer(user: UserId, chat: ChatId | null, now: number): AnswerLimit;
  /** An unprompted answer in this group, to this person. */
  proactive(chat: ChatId, user: UserId, now: number): boolean;
  /** A moderation check in this group. */
  triage(chat: ChatId, now: number): boolean;
  /** A /report from this person. */
  report(user: UserId, now: number): boolean;
  /** A button press from this person, before any API call. */
  press(user: UserId, now: number): boolean;
  /** Starts this person's 10-minute pause after a refusal or a max_tokens stop; true when it is the second within 10 minutes. */
  coolDown(user: UserId, now: number): boolean;
  /** The busy reply for this person, whose answer was dropped from the answers' queue after waiting: true at most once per 10 minutes. */
  busyReply(user: UserId, now: number): boolean;
  /** Forgets every key with nothing left in its window: no user ID stays past 10 minutes. */
  prune(now: number): void;
}
