import { createHash } from "node:crypto";
import { buildKnowledge } from "@/shared/bot/knowledge";
import type { Pack, PackSource } from "../../src/telegram/agent/types";
import type { AnswerModel, Budget, ClaudeClient } from "../../src/telegram/claude/types";
import answersJson from "./cases/answers.json";
import moderationJson from "./cases/moderation.json";
import proactiveJson from "./cases/proactive.json";
import { ALLOW, EVAL_DATA, OFFICIAL, siteFacts } from "./fixtures";
import { readAnswerCases, readModerationCases, translatedLanguages } from "./grade-cases";
import type { EvalArgs } from "./run-args";
import { type EvalEnv, inLanguage } from "./run-cases";
import type { Plan } from "./run-sections";

/**
 * What one run of the eval works on (run.ts): the cases --only and --lang
 * pick, the knowledge pack built from this checkout, and the world every
 * case runs in. Nothing here reads the environment or the network: the
 * client and the budget come in, so a test can run the whole eval offline
 * with a fake client (tests/eval-run.test.ts).
 */

/** The cases this run takes, by --only and --lang; or why it can't run. Throws when a case file is malformed. */
export function planOf(args: EvalArgs): Plan | string {
  const answers = readAnswerCases(answersJson, "cases/answers.json");
  const proactive = readAnswerCases(proactiveJson, "cases/proactive.json");
  const moderation = readModerationCases(moderationJson, "cases/moderation.json");
  const only = new Set(args.only);
  const known = new Set([...answers, ...proactive, ...moderation].map((c) => c.id));
  const unknown = [...only].filter((id) => !known.has(id));
  if (unknown.length > 0) return `No case has the ID ${unknown.join(", ")}.`;
  const picked = <T extends { id: string }>(cases: T[]) => (only.size === 0 ? cases : cases.filter((c) => only.has(c.id)));
  const lang = args.lang;
  if (lang && !translatedLanguages(answers).includes(lang)) return `The answer cases carry no ${lang} questions: --lang takes ${translatedLanguages(answers).join(" or ")}.`;
  const chosen = picked(answers);
  const translated = lang ? chosen.flatMap((c) => inLanguage(c, lang) ?? []) : [];
  return { answers: chosen, proactive: picked(proactive), moderation: picked(moderation), translated, untranslated: lang ? chosen.length - translated.length : 0 };
}

/** The pack as the worker builds it, from this checkout, with the fixed site facts (Launch invite-only, an e-mail contact). */
export function evalPack(now: number): PackSource {
  const k = buildKnowledge();
  const pack: Pack = { core: k.core, glossary: k.glossary, hash: k.hash, addresses: k.addresses, site: siteFacts(k.hash, now) };
  return { current: () => pack, refresh: async () => undefined, contact: () => "set", health: () => ({}) };
}

/** One pseudonymous metadata.user_id for every eval request, as the bot's user codes look: Anthropic sees the eval as one asker. */
export const EVAL_USER_CODE = createHash("sha256").update("tonkfun.fun offline eval").digest("hex").slice(0, 32);

/** The world every case runs in: this client, budget and answers' model, the pack, the fixed tools' data, official accounts and allow-list, and the UTC date. */
export function evalEnv(client: ClaudeClient, budget: Budget, now: number, model: AnswerModel): EvalEnv {
  return {
    client, budget, model, pack: evalPack(now), data: EVAL_DATA, official: OFFICIAL, allow: ALLOW, userCode: EVAL_USER_CODE, date: new Date(now).toISOString().slice(0, 10),
  };
}
