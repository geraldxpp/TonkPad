import type { AiOff, SpendRecord } from "../community/types";
import { createBreaker } from "./budget-breaker";
import { ANSWER_LANES, type AnswerLane, BOT_SPLIT, type BudgetSplit, isAnswerLane, kindOf } from "./budget-split";
import { cardFor, costOf } from "./prices";
import { type Budget, type BudgetStatus, type CallKind, type ClaudeFailure, type ClaudeModel, LANES, type Lane, UNSENT } from "./types";

export { BOT_SPLIT, type BudgetSplit, LANE_SHARES, ONE_CAP, TRIAGE_KEEP } from "./budget-split";

/** What the admins hear about: 80% of the day, a lane or the day's cap running out, checks or answers pausing after repeated errors or a bad request, a refused key, stopping for billing or a missing model, and checks, answers or AI coming back. */
export type BudgetEvent = "warn80" | "lane" | "cap" | "circuit" | "auth" | "bad_request" | "billing" | "not_found" | "restored";

export interface BudgetOptions {
  /** The day's cap in dollars; 0 keeps every model call off. */
  capUsd: number;
  /** The saved day's spending, restored when it is today's. */
  saved: SpendRecord | null;
  /** The saved AI-off switch. */
  off: AiOff | null;
  /** Called on every commit with the day's spending per lane (no IDs). */
  save: (s: SpendRecord) => void;
  saveOff: (v: AiOff | null) => void;
  /** `lane`: the lane a "lane" event closed. `kind`: the kind of call a pause, bad request or return is about, null for every call ("restored" without one is AI's return). */
  onEvent: (event: BudgetEvent, status: BudgetStatus, lane: Lane | null, kind: CallKind | null) => void;
  now: () => number;
  /** How the cap is split between the lanes: the bot's own (BOT_SPLIT) unless the offline eval gives another. */
  split?: BudgetSplit;
}

const DAY = 86_400_000;
/** Dollars below this are rounding noise. */
const EPS = 1e-9;
/** Failures that may have been billed, so their reservation is charged (except a connection that never sent the request, UNSENT); any other came with the API's own status, so it is released. */
const KEPT: readonly ClaudeFailure[] = ["timeout", "network", "unknown"];

const micro = (usd: number) => Math.round(usd * 1e6) / 1e6;
const utcDay = (now: number) => new Date(Math.abs(now) <= 8.64e15 ? now : 0).toISOString().slice(0, 10);
const zero = (): Record<Lane, number> => ({ triage: 0, group: 0, proactive: 0, private: 0 });
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
/** Whether a failed request's reservation is charged: it may have been billed. */
const keeps = (failure: ClaudeFailure | null, type: string | null | undefined) => failure !== null && KEPT.includes(failure) && !(failure === "network" && type === UNSENT);
/** Runs a callback the ledger doesn't own: an alert or a save that fails must never break it. */
const quietly = (run: () => void) => {
  try {
    run();
  } catch {
    // Best effort: the ledger stays right in memory.
  }
};

/**
 * The day's AI spending in lanes (prompts/15-community-agent.md, The daily
 * cap and its lanes); the day is the UTC date. Before each request the
 * ledger reserves its worst case, and only refuses one that doesn't fit:
 * its lane, the answer lanes together (checks keep their share) or the day,
 * with what is spent and in flight, would pass its cap, or a private or
 * unprompted answer would pass 80% of the day; or AI is off, its kind of
 * call is paused after failures or a ramp limit waits (budget-breaker.ts).
 * A lane, the 80% mark and the day's cap close, each with one event, only
 * once committed spending reaches them (model#1): a worst case is several
 * times a real request, so closing on one stopped them early. A commit
 * charges the real cost at its ticket's model's prices and tells its kind's
 * breaker how it ended. Events and saving never throw into the caller.
 */
export function createBudget(options: BudgetOptions): Budget {
  const split = options.split ?? BOT_SPLIT;
  const capUsd = Number.isFinite(options.capUsd) && options.capUsd > 0 ? options.capUsd : 0;
  /** A gate at this share of the cap; the whole cap is no gate of its own, so only the day's cap (and its event) stops there. */
  const gate = (share: number) => (share < 1 ? micro(capUsd * share) : Number.POSITIVE_INFINITY);
  const laneCap = (lane: AnswerLane) => gate(split.shares[lane]);
  const answersCap = gate(1 - split.triageKeep);
  const lateCap = gate(split.late);

  let day = utcDay(options.now());
  let spent = zero();
  let calls = zero();
  let refusals = zero();
  let errors = 0;
  const saved = options.saved;
  if (saved?.day === day) for (const lane of LANES) spent[lane] = positive(saved.lanes?.[lane]);
  const daySpent = () => sum(Object.values(spent));
  const answersSpent = () => sum(ANSWER_LANES.map((l) => spent[l]));
  /** Today's closed gates: answer lanes whose spending reached their cap, the 80% mark and the day's cap (each restored quietly from the saved spending). */
  const out = new Set<AnswerLane>(ANSWER_LANES.filter((l) => spent[l] >= laneCap(l) - EPS));
  let late = daySpent() >= lateCap - EPS;
  let capped = daySpent() >= capUsd - EPS;
  /** Reservations in flight: they count against the day until committed, and a commit charges the day it lands in. */
  const held = new Map<number, { lane: Lane; usd: number; model: ClaudeModel }>();
  let lastId = 0;
  const heldIn = (lanes: readonly Lane[]) => sum([...held.values()].filter((h) => lanes.includes(h.lane)).map((h) => h.usd));

  const snapshot = (now: number): BudgetStatus => {
    const reason = capUsd === 0 ? "off" : (breaker.reason(now) ?? (capped ? "cap" : null));
    const lane = (l: Lane) => ({ spentUsd: spent[l], capUsd: isAnswerLane(l) ? Math.min(laneCap(l), capUsd) : micro(capUsd - answersSpent()), calls: calls[l] });
    return {
      day,
      spentUsd: daySpent(),
      capUsd,
      lanes: { triage: lane("triage"), group: lane("group"), proactive: lane("proactive"), private: lane("private") },
      on: reason === null,
      reason,
      until: reason === "cap" ? (Math.floor(now / DAY) + 1) * DAY : reason === null || reason === "off" ? null : breaker.until(now),
      refusals: sum(Object.values(refusals)),
      errors,
    };
  };
  const emit = (event: BudgetEvent, lane: Lane | null, now: number, kind: CallKind | null = null) => quietly(() => options.onEvent(event, snapshot(now), lane, kind));
  const breaker = createBreaker(options.off, (v) => quietly(() => options.saveOff(v)), (event, now, kind) => emit(event, null, now, kind));

  /** A new UTC day starts with nothing spent and every gate open. */
  const settle = (now: number) => {
    const today = utcDay(now);
    if (today <= day) return;
    day = today;
    spent = zero();
    calls = zero();
    refusals = zero();
    errors = 0;
    out.clear();
    late = false;
    capped = false;
  };
  const running = (lane: Lane, now: number) => capUsd > 0 && !capped && breaker.running(kindOf(lane), now);
  /** Closes a gate for the rest of the day and says so once. */
  const shut = (gate: "lane" | "warn80" | "cap", lane: AnswerLane | null, now: number) => {
    if (lane) out.add(lane);
    if (gate === "warn80") late = true;
    if (gate === "cap") capped = true;
    emit(gate, lane, now);
  };
  /** After a commit in `lane`: the gates its spending reached close, the 80% mark, then that lane, then the day's cap. */
  const close = (lane: Lane, now: number) => {
    if (!late && daySpent() >= lateCap - EPS) shut("warn80", null, now);
    if (isAnswerLane(lane) && !out.has(lane) && spent[lane] >= laneCap(lane) - EPS) shut("lane", lane, now);
    if (!capped && daySpent() >= capUsd - EPS) shut("cap", null, now);
  };

  return {
    available(lane, now) {
      settle(now);
      if (!running(lane, now)) return false;
      return !isAnswerLane(lane) || (!out.has(lane) && !(late && lane !== "group"));
    },

    /** Only refuses what doesn't fit, counting what is spent and every reservation in flight: no gate closes here, and no event is sent. */
    reserve(lane, worstUsd, now, model) {
      settle(now);
      if (!running(lane, now) || !Number.isFinite(worstUsd) || worstUsd < 0 || cardFor(model, 0) === null) return null;
      const total = daySpent() + heldIn(LANES) + worstUsd;
      if (isAnswerLane(lane)) {
        if (out.has(lane) || (lane !== "group" && late)) return null;
        if (spent[lane] + heldIn([lane]) + worstUsd > laneCap(lane) + EPS) return null;
        if (answersSpent() + heldIn(ANSWER_LANES) + worstUsd > answersCap + EPS) return null;
        if (lane !== "group" && total > lateCap + EPS) return null;
      }
      if (total > capUsd + EPS) return null;
      lastId += 1;
      held.set(lastId, { lane, usd: worstUsd, model });
      calls[lane] += 1;
      return { id: lastId, lane, worstUsd, model };
    },

    /** An unknown or already settled ticket charges nothing. A commit with neither usage nor failure means nothing was sent: released. The gates its spending reached close here, each with its event. */
    commit(ticket, usage, failure, now, type) {
      settle(now);
      const hold = held.get(ticket.id);
      if (!hold) return 0;
      held.delete(ticket.id);
      const real = usage ? costOf(usage, hold.model) : Number.NaN;
      const usd = usage ? (Number.isFinite(real) && real >= 0 ? real : hold.usd) : keeps(failure, type) ? hold.usd : 0;
      spent[hold.lane] += usd;
      quietly(() => options.save({ day, lanes: { ...spent } }));
      if (usage) breaker.replied(kindOf(hold.lane), now);
      else if (failure) breaker.attemptFailed(kindOf(hold.lane), failure, now);
      close(hold.lane, now);
      return usd;
    },

    failed(failure, retryAfterMs, now, lane) {
      settle(now);
      errors += 1;
      breaker.failed(failure, retryAfterMs, now, lane ? kindOf(lane) : null);
    },

    refused(lane) {
      settle(options.now());
      refusals[lane] += 1;
    },

    setOn(on, now) {
      settle(now);
      breaker.setOn(on, now);
    },

    status(now) {
      settle(now);
      return snapshot(now);
    },
  };
}
