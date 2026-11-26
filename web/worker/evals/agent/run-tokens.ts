import { LOCALES, localeName } from "@/shared/i18n/config";
import { answerSystem, glossaryText } from "../../src/telegram/agent/prompt";
import { ANSWER_TOOLS } from "../../src/telegram/agent/tools";
import type { Pack } from "../../src/telegram/agent/types";
import { type AnswerModel, type ClaudeClient, type ClaudeModel, TRIAGE_MODEL } from "../../src/telegram/claude/types";
import type { AllowList, OfficialAccounts } from "../../src/telegram/community/types";
import { triageSystem } from "../../src/telegram/mod/triage-prompt";
import { count } from "./run-print";

/**
 * --count-tokens (prompts/15-community-agent.md, Still unverified: the
 * pack's token counts): each part of what the answers and the checks send,
 * counted by Anthropic's count_tokens, which runs no model: the answers'
 * parts on the answers' model, the check's prompt on the check's (Haiku
 * 5.5). Each part is counted as a system prompt beside a one-character
 * question, and that question alone (on the same model) is subtracted, so
 * the figures are the parts' own (give or take a few tokens of framing).
 */

type CountParams = Parameters<ClaudeClient["countTokens"]>[0];

const QUESTION: CountParams["messages"] = [{ role: "user", content: "?" }];

const system = (model: ClaudeModel, text: string): CountParams => ({ model, system: [{ type: "text", text }], messages: QUESTION });

/** Prints the counts; false when count_tokens failed for a baseline or a part (the key, the network or Anthropic). */
export async function countPack(client: ClaudeClient, pack: Pack, official: OfficialAccounts, allow: AllowList, model: AnswerModel): Promise<boolean> {
  const baselines = new Map<string, number>();
  for (const m of new Set<ClaudeModel>([model, TRIAGE_MODEL])) {
    const tokens = await client.countTokens({ model: m, messages: QUESTION });
    if (tokens === null) {
      console.log("count_tokens failed, so nothing was counted. Check the key and the network, and try again.");
      return false;
    }
    baselines.set(m, tokens);
  }
  const [rules, core] = answerSystem(pack, "en", official);
  const rows: Array<[string, number, CountParams]> = [
    ["Rules (the answers' first system block)", rules.text.length, system(model, rules.text)],
    ["English core with the site's lines (cached 1 h)", core.text.length, system(model, core.text)],
  ];
  for (const { code } of LOCALES) {
    const glossary = glossaryText(pack, code);
    if (glossary !== null) rows.push([`Glossary ${code}, ${localeName(code)} (cached 1 h)`, glossary.length, system(model, glossary)]);
  }
  rows.push(["Answer prefix in English: rules, core and tools", 0, { model, system: [rules, core], tools: ANSWER_TOOLS, messages: QUESTION }]);
  const checkPrompt = triageSystem(official, allow);
  rows.push([`The check's system prompt (cached 1 h, on ${TRIAGE_MODEL})`, checkPrompt.length, system(TRIAGE_MODEL, checkPrompt)]);

  const subtracted = [...baselines].map(([m, tokens]) => `${count(tokens)} on ${m}`).join(", ");
  console.log(`Token counts, answers on ${model} (count_tokens; a one-character question, ${subtracted} tokens, subtracted):`);
  const width = Math.max(...rows.map(([label]) => label.length));
  let failed = 0;
  for (const [label, chars, params] of rows) {
    const tokens = await client.countTokens(params);
    const baseline = baselines.get(params.model) ?? 0;
    if (tokens === null) failed += 1;
    const ratio = tokens !== null && chars > 0 ? ` (${(chars / Math.max(1, tokens - baseline)).toFixed(2)} characters a token)` : "";
    console.log(`  ${label.padEnd(width)}  ${tokens === null ? "failed" : count(tokens - baseline)}${ratio}`);
  }
  console.log("The English glossary is never sent: English askers read the core alone.");
  return failed === 0;
}
