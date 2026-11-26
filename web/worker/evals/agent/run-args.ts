import { isLocale, type Locale } from "@/shared/i18n/config";
import { ANSWER_SETTINGS } from "../../src/telegram/agent/answer-request";
import { ANSWER_MODELS, type AnswerModel, DEFAULT_ANSWER_MODEL, TRIAGE_MODEL } from "../../src/telegram/claude/types";
import { CAPS_USD } from "./run-budget";

/** The eval's command line (run.ts): npm run eval:agent -- --yes [--model id] [--lang ru] [--only id] [--effort low] [--count-tokens]. */

/** Effort levels the answers may be rerun at for comparison: any but the one their model runs at (agent/answer-request.ts). */
export const COMPARE_EFFORTS = ["low", "medium", "high"] as const;
export type CompareEffort = (typeof COMPARE_EFFORTS)[number];

export interface EvalArgs {
  yes: boolean;
  help: boolean;
  /** The answers' model: --model, else TELEGRAM_AI_ANSWER_MODEL in the shell, else the bot's default. Checks always run on TRIAGE_MODEL. */
  model: AnswerModel;
  /** Run the answer cases again in this language. */
  lang: Locale | null;
  /** Only the cases with these IDs. */
  only: string[];
  /** Run the answer cases again at this effort. */
  effort: CompareEffort | null;
  /** Count the pack's tokens instead of running cases. */
  countTokens: boolean;
}

const isEffort = (value: string | undefined): value is CompareEffort => (COMPARE_EFFORTS as readonly string[]).includes(value ?? "");
const modelOf = (value: string | undefined): AnswerModel | null => ANSWER_MODELS.find((m) => m === value?.trim().toLowerCase()) ?? null;
const MODELS = `${ANSWER_MODELS.slice(0, -1).join(", ")} or ${ANSWER_MODELS[ANSWER_MODELS.length - 1]}`;

const WITH_VALUE = new Set(["--lang", "--effort", "--only", "--model"]);
const cap = (model: AnswerModel) => `$${CAPS_USD[model].toFixed(2)}`;

/**
 * The options, or what's wrong with them. Takes "--lang ru" and "--lang=ru"
 * alike. Without --model, the answers' model is TELEGRAM_AI_ANSWER_MODEL from
 * `env` (the shell's), which the eval holds to the same list as the bot, but
 * refuses rather than ignores when it is something else.
 */
export function parseArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = {}): EvalArgs | string {
  const args: EvalArgs = { yes: false, help: false, model: DEFAULT_ANSWER_MODEL, lang: null, only: [], effort: null, countTokens: false };
  const words = argv.flatMap((a) => (/^--[a-z-]+=/.test(a) ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a]));
  let model: AnswerModel | null = null;
  let i = 0;
  while (i < words.length) {
    const flag = words[i];
    const value = WITH_VALUE.has(flag) ? words[i + 1] : undefined;
    i += WITH_VALUE.has(flag) ? 2 : 1;
    if (flag === "--yes") args.yes = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else if (flag === "--count-tokens") args.countTokens = true;
    else if (flag === "--model") {
      model = modelOf(value);
      if (!model) return `--model takes ${MODELS}.`;
    } else if (flag === "--lang") {
      if (!value || !isLocale(value) || value === "en") return "--lang takes one of the site's languages other than en, such as ru or es.";
      args.lang = value;
    } else if (flag === "--effort") {
      if (!isEffort(value)) return `--effort takes ${COMPARE_EFFORTS.join(", ")}: the answers run again at that level to compare.`;
      args.effort = value;
    } else if (flag === "--only") {
      const ids = (value ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");
      if (ids.length === 0) return "--only takes one or more case IDs, comma-separated.";
      args.only.push(...ids);
    } else return `Unknown option: ${flag}`;
  }
  const fromEnv = env.TELEGRAM_AI_ANSWER_MODEL?.trim() ?? "";
  if (!model && fromEnv !== "") {
    model = modelOf(fromEnv);
    if (!model) return `TELEGRAM_AI_ANSWER_MODEL in this shell isn't ${MODELS}: fix it, or pass --model.`;
  }
  args.model = model ?? DEFAULT_ANSWER_MODEL;
  const base = ANSWER_SETTINGS[args.model].effort;
  if (args.effort === base) {
    const others = COMPARE_EFFORTS.filter((e) => e !== base).join(" or ");
    return `--effort takes ${others} with ${args.model}: its answers run at ${base}, and this reruns them at another level to compare.`;
  }
  return args;
}

export const HELP = `Usage: npm run eval:agent -- --yes [--model id] [--lang ru] [--only id,...] [--effort low] [--count-tokens]

The community agent's offline eval (prompts/15-community-agent.md, Tests). It
sends synthetic questions to the answers' model (${DEFAULT_ANSWER_MODEL} unless
--model or TELEGRAM_AI_ANSWER_MODEL picks another) and messages to the
check's (${TRIAGE_MODEL}), through the bot's real answer loop, output gate
and check, with the key in ANTHROPIC_API_KEY in this shell, and grades every
reply by code. It costs real money: the estimate, priced on the models'
rate cards, is printed first, and a budget stops it at ${cap("claude-haiku-5-5")} when answers run
on Haiku 5.5, ${cap("claude-sonnet-5-5")} on Sonnet 5.5 and ${cap("claude-opus-5-5")} on Opus 5.5. Every section shares
that one cap, without the bot's lanes (which would stop group answers at 45%
of it), so the --effort and --lang passes run on whatever the sections
before them left.
It reads no .env file, writes no file and keeps nothing: all output is here.

  --yes             Run it. Without it, only the plan and the estimate print.
  --model <id>      The answers' model: claude-sonnet-5-5 (the bot's default),
                    claude-opus-5-5 or claude-haiku-5-5. Without it,
                    TELEGRAM_AI_ANSWER_MODEL in this shell, when set. Checks
                    always run on ${TRIAGE_MODEL}.
  --lang <code>     After English, run the answer cases again in this language
                    (the cases carry es and ru).
  --only <ids>      Only these cases: IDs from cases/*.json, comma-separated.
  --effort <level>  Run the answer cases again at another effort (low, medium
                    or high; answers run at high on Haiku 5.5 and at medium on
                    Sonnet 5.5 and Opus 5.5), to compare gate blocks,
                    refusals, latency, tokens and cost.
  --count-tokens    Count the knowledge pack's tokens (rules, English core,
                    each glossary, the cached prefixes) with count_tokens, on
                    the answers' model and the check's, instead of running
                    the cases. No model output is made.
  --help            This text.

It exits 0 when every case passes, 1 when any fails, 2 when it can't run.

The deterministic cases are unit tests: npm test runs them, with no key and
no cost (worker/tests/):
  rules    mod-rules, mod-rules-markers, mod-secrets, mod-links, mod-names,
           mod-flood, mod-edits, mod-raid
  gate     agent-gate, agent-gate-claims, agent-gate-families,
           agent-gate-hidden, agent-gate-negation, agent-gate-spelled,
           agent-render
  router   telegram-router, agent-triggers, agent-proactive
  the answer loop and the check, with a fake client: agent-answer,
           agent-answer-loop, agent-answer-models, mod-triage,
           mod-triage-request
  the Q&A flow (refusals and the asker's pause, the DM warning, presses):
           community-qa, community-qa-pause, community-qa-warning,
           community-qa-press
  this eval: its options, grading, case files and budget, and a whole
           run with a fake client: eval-args, eval-grade,
           eval-grade-cases, eval-budget, eval-run`;
