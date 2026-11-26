import { createBudget, ONE_CAP } from "../../src/telegram/claude/budget";
import type { AnswerModel, Budget } from "../../src/telegram/claude/types";

/**
 * The most one run may spend, by the answers' model: the budget stops it
 * there (the estimate is printed first). An answer on Sonnet 5.5 costs some
 * 10 times one on Haiku 5.5, and on Opus 5.5 some 20 times, so a $1.00 cap
 * would stop their runs early; checks run on Haiku 5.5 whatever the model.
 */
export const CAPS_USD: Readonly<Record<AnswerModel, number>> = Object.freeze({ "claude-haiku-5-5": 1, "claude-sonnet-5-5": 5, "claude-opus-5-5": 10 });

/**
 * The eval's budget (run.ts): the bot's own ledger (each request's worst
 * case reserved and its real cost charged at its model's prices, the
 * breakers), on one cap that every lane and every section shares
 * (claude/budget-split.ts, ONE_CAP). The bot's split would stop group
 * answers at 45% of the cap, so the --effort and --lang passes, which ask
 * the same questions again, would end early; here each section runs on
 * whatever the ones before it left, and only the run's cap stops it. Nothing
 * is saved, and each event prints one line through `say`.
 */
export function evalBudget(say: (line: string) => void, capUsd: number, now: () => number = Date.now): Budget {
  return createBudget({
    capUsd,
    saved: null,
    off: null,
    save: () => undefined,
    saveOff: () => undefined,
    onEvent: (event, _status, lane) => say(`(budget: ${event}${lane ? `, the ${lane} lane` : ""})`),
    now,
    split: ONE_CAP,
  });
}
