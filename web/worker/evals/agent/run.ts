import { ANSWER_SETTINGS } from "../../src/telegram/agent/answer-request";
import { createClaudeClient } from "../../src/telegram/claude/client";
import { TRIAGE_MODEL } from "../../src/telegram/claude/types";
import { ALLOW, OFFICIAL } from "./fixtures";
import { HELP, parseArgs } from "./run-args";
import { CAPS_USD, evalBudget } from "./run-budget";
import { evalEnv, evalPack, planOf } from "./run-plan";
import { estimateUsd, runSections } from "./run-sections";
import { countPack } from "./run-tokens";

/**
 * The community agent's offline eval (prompts/15-community-agent.md, Tests),
 * run by the owner with their own key: npm run eval:agent -- --yes. It never
 * runs under Vitest, without ANTHROPIC_API_KEY in the shell or without
 * --yes, and prints its model and estimated cost before anything else. It
 * uses the bot's real Claude client, answer loop, gate, views and check, on
 * the answers' model --model or TELEGRAM_AI_ANSWER_MODEL picks (the bot's
 * default without either), with a fresh budget capped for that model that
 * every section shares (run-budget.ts), the knowledge pack built from this
 * checkout and the fixed world in fixtures.ts (run-plan.ts). Output goes to
 * stdout only. tests/eval-run.test.ts runs the same plan, world and sections
 * offline, with a fake client in place of the real one.
 */

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), process.env);
  if (typeof args === "string") {
    console.log(`${args}\n\n${HELP}`);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (process.env.VITEST) {
    console.log("The eval never runs under Vitest: it calls Anthropic's API with a real key.");
    return 2;
  }
  const plan = planOf(args);
  if (typeof plan === "string") {
    console.log(plan);
    return 2;
  }
  const capUsd = CAPS_USD[args.model];
  const effort = ANSWER_SETTINGS[args.model].effort;
  console.log(`tonkfun.fun community agent, offline eval: answers on ${args.model} at effort ${effort}, checks on ${TRIAGE_MODEL}`);
  if (args.countTokens) console.log("Counting the knowledge pack's tokens with count_tokens: no model output is made, and no case runs.");
  else {
    const passes = [`answers at effort ${effort}`, args.effort ? `again at ${args.effort}` : "", args.lang ? `again in ${args.lang} (${plan.translated.length} with a translation)` : ""];
    const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
    console.log(`Cases: ${n(plan.answers.length, "answer")}, ${n(plan.proactive.length, "unprompted candidate")}, ${n(plan.moderation.length, "moderation message")}; ${passes.filter(Boolean).join(", ")}.`);
    const estimate = estimateUsd(plan, args);
    console.log(`Estimated cost: about $${estimate.toFixed(2)} (an estimate; the run stops at $${capUsd.toFixed(2)}).`);
    if (estimate > capUsd) console.log("That is above the cap, so the run will likely stop before the end: run fewer cases with --only, or fewer passes.");
  }
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (apiKey === "") {
    console.log("Set ANTHROPIC_API_KEY in this shell to run it. The eval reads no .env file.");
    return 2;
  }
  if (!args.yes) {
    console.log(args.countTokens ? "Add --yes to count. It calls Anthropic's API with the key." : "Add --yes to run it. It spends Anthropic credits on the key's account.");
    return 2;
  }
  const client = createClaudeClient({ apiKey, log: () => undefined });
  const now = Date.now();
  if (args.countTokens) return (await countPack(client, evalPack(now).current(), OFFICIAL, ALLOW, args.model)) ? 0 : 1;
  const env = evalEnv(client, evalBudget((line) => console.log(line), capUsd), now, args.model);
  const failed = await runSections(plan, args, env, capUsd);
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.log(`The eval stopped: ${error instanceof Error ? error.message : "an unexpected error"}`);
    process.exitCode = 2;
  },
);
