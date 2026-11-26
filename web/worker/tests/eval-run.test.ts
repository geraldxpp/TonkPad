// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateAnswer } from "../src/telegram/agent/gate";
import type { AnswerOutput } from "../src/telegram/agent/types";
import { type ClaudeClient, type ClaudeRequest, DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import { LEVEL_WORDS } from "../evals/agent/fixtures";
import type { AnswerCase } from "../evals/agent/grade";
import { parseArgs } from "../evals/agent/run-args";
import { CAPS_USD, evalBudget } from "../evals/agent/run-budget";
import { runAnswer } from "../evals/agent/run-cases";
import { EVAL_USER_CODE, evalEnv, planOf } from "../evals/agent/run-plan";
import { estimateUsd, runSections } from "../evals/agent/run-sections";
import { claudeMessage, ok, textBlock } from "./community-fixtures";
import { VALID, verdictReply } from "./mod-triage-fixtures";

/**
 * The offline eval run end to end with a fake client (K12): the plan, the
 * world and the sections run.ts runs, through the bot's real answer loop,
 * gate, views and check, graded by code. Only the client is fake: nothing
 * reaches the network, and no key is read.
 */

/** A model that never touches the network: every check says "a question about tonkfun.fun", every answer is `answer`. */
function fakeModel(answer: AnswerOutput): ClaudeClient & { requests: ClaudeRequest[] } {
  const requests: ClaudeRequest[] = [];
  return {
    requests,
    async create(request) {
      requests.push(request);
      if (request.kind === "triage") return ok(verdictReply(JSON.stringify(VALID)));
      return ok(claudeMessage({ content: [textBlock(JSON.stringify(answer))], stop_reason: "end_turn" }));
    },
    countTokens: async () => null,
  };
}

const output = (reply: string): AnswerOutput => ({ language: "en", answered: true, reply, links: ["docs_fees"], token: "", escalate: "none", admin_note: "" });
const FEES = output("On fees: every curve trade pays a fixed 1% protocol fee to tonkfun.fun.");

let printed: string[] = [];
beforeEach(() => {
  printed = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => void printed.push(parts.map(String).join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** A section's pass or fail table as printed: each case's ID to its row ("PASS" or "FAIL", then its failures). */
function table(title: string): Map<string, string> {
  const at = printed.findIndex((line) => line.startsWith(`\n${title}: `));
  const n = Number(/ of (\d+) passed$/.exec(printed[at] ?? "")?.[1] ?? 0);
  return new Map(printed.slice(at + 1, at + 1 + n).map((row) => [row.trim().split(/\s+/)[1], row.trim()]));
}

describe("the eval, run offline with a fake client", () => {
  it("runs every case file's cases through the bot's real code, and grades each one by code", async () => {
    const args = parseArgs(["--yes", "--model", "claude-haiku-5-5", "--effort", "medium", "--lang", "es"]);
    if (typeof args === "string") throw new Error(args);
    const plan = planOf(args);
    if (typeof plan === "string") throw new Error(plan);
    const model = fakeModel(FEES);
    const cap = CAPS_USD[args.model];
    const budget = evalBudget((line) => void printed.push(line), cap);
    const failed = await runSections(plan, args, evalEnv(model, budget, Date.now(), args.model), cap);

    const sections = [
      ["Answers, effort high", plan.answers],
      ["Unprompted candidates, effort high", plan.proactive],
      ["Moderation checks", plan.moderation],
      ["Answers, effort medium", plan.answers],
      ["Answers in es, effort high", plan.translated],
    ] as const;
    for (const [title, cases] of sections) expect([...table(title).keys()], title).toEqual(cases.map((c) => c.id));
    expect(plan.translated.length).toBeGreaterThan(40);
    // Graded, not broken: the canned answer passes the fee question and fails what it doesn't answer.
    expect(printed.filter((line) => line.includes("the eval failed on this case"))).toEqual([]);
    expect(table("Answers, effort high").get("fees-curve")).toBe("PASS  fees-curve");
    expect(table("Unprompted candidates, effort high").get("pro-protocol-fee")).toBe("PASS  pro-protocol-fee");
    expect(table("Answers, effort high").get("hf-crisis-en")).toMatch(/^FAIL .*escalate none, expected crisis/);
    expect(table("Answers in es, effort high").get("fees-curve")).toMatch(/^FAIL .*replied in en, expected es/);
    expect(table("Moderation checks").get("mod-spam-volume-en")).toMatch(/^FAIL .*verdict ok, expected spam or scam/);
    expect(failed).toBe(true);

    // The answers ran at high, and once more at --effort medium; the checks at low; every request as the eval's one asker.
    const effort = (r: ClaudeRequest) => `${r.kind} ${r.params.output_config?.effort}`;
    const sent = model.requests.map(effort);
    expect(sent.filter((e) => e === "answer high")).toHaveLength(plan.answers.length + plan.proactive.length + plan.translated.length);
    expect(sent.filter((e) => e === "answer medium")).toHaveLength(plan.answers.length);
    expect(sent.filter((e) => e === "triage low")).toHaveLength(plan.proactive.length + plan.moderation.length);
    expect(new Set(model.requests.map((r) => r.params.metadata?.user_id))).toEqual(new Set([EVAL_USER_CODE]));
    expect(new Set(model.requests.map((r) => r.params.model))).toEqual(new Set(["claude-haiku-5-5"]));
    const spent = budget.status(Date.now()).spentUsd;
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThan(cap);
    expect(printed.some((line) => line.startsWith("The budget charged $"))).toBe(true);
    expect(printed.some((line) => line.startsWith("(budget:"))).toBe(false);
  });

  it("runs the answers on the bot's default, Sonnet 5.5, at medium, compares them at high, and keeps the checks on Haiku 5.5", async () => {
    const args = parseArgs(["--yes", "--only", "fees-curve,pro-protocol-fee,mod-spam-volume-en", "--effort", "high"]);
    if (typeof args === "string") throw new Error(args);
    const plan = planOf(args);
    if (typeof plan === "string") throw new Error(plan);
    const model = fakeModel(FEES);
    const cap = CAPS_USD[args.model];
    const budget = evalBudget((line) => void printed.push(line), cap);
    await runSections(plan, args, evalEnv(model, budget, Date.now(), args.model), cap);
    expect([args.model, cap]).toEqual([DEFAULT_ANSWER_MODEL, 5]);
    expect(table("Answers, effort medium").get("fees-curve")).toBe("PASS  fees-curve");
    expect(table("Unprompted candidates, effort medium").get("pro-protocol-fee")).toBe("PASS  pro-protocol-fee");
    expect(table("Answers, effort high").get("fees-curve")).toBe("PASS  fees-curve");
    const sent = model.requests.map((r) => `${r.kind} ${r.params.model} ${r.params.output_config?.effort} ${r.params.max_tokens}`);
    expect(sent.sort()).toEqual([
      "answer claude-sonnet-5-5 high 2500",
      "answer claude-sonnet-5-5 medium 2500",
      "answer claude-sonnet-5-5 medium 2500",
      "triage claude-haiku-5-5 low 400",
      "triage claude-haiku-5-5 low 400",
    ]);
    // Each call priced on its own model's card: three Sonnet replies and two Haiku checks of the fake's 100 tokens in, 50 out.
    expect(budget.status(Date.now()).spentUsd).toBeCloseTo((3 * (100 * 2 + 50 * 10) + 2 * (100 * 0.1 + 50 * 0.5)) / 1e6, 12);
  });

  it("estimates each model's run on its own card, within that model's cap for the English run and for the --lang one", () => {
    const usd: number[] = [];
    for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const) {
      for (const argv of [["--model", model], ["--model", model, "--lang", "es"]]) {
        const args = parseArgs(argv);
        if (typeof args === "string") throw new Error(args);
        const plan = planOf(args);
        if (typeof plan === "string") throw new Error(plan);
        usd.push(estimateUsd(plan, args));
        expect(usd.at(-1), argv.join(" ")).toBeLessThan(CAPS_USD[model]);
      }
    }
    // Sonnet's English run is some 7 times Haiku's (half of 2,500 output tokens an answer against half of Haiku's 8,000), and Opus's about twice Sonnet's.
    expect(usd[2] / usd[0]).toBeGreaterThan(6);
    expect(usd[4] / usd[2]).toBeGreaterThan(1.9);
  });
});

describe("an answer that names the official accounts", () => {
  const c: AnswerCase = { id: "official-names", question: "Where can I follow new launches?", lang: "en", chat: "group", mode: "direct", expect: { escalate: "none", answered: true } };
  const named = output("On launches: the channel tonkfun_launches posts every one, and TonkfunBot answers questions here in tonkfun_chat.");

  it("is shown: the gate knows the accounts the answer loop was given, as the bot's does", async () => {
    const run = await runAnswer(c, evalEnv(fakeModel(named), evalBudget(() => undefined, 1), Date.now(), DEFAULT_ANSWER_MODEL), null);
    expect(run.gated?.blocked).toBeNull();
    expect(run.view?.text).toContain("the channel tonkfun_launches posts every one");
    expect(run.grade).toEqual({ id: "official-names", pass: true, failures: [] });
    // The same reply through the gate without them is blocked: passing them is what lets it through.
    if (run.result.kind !== "answer") throw new Error(run.result.kind);
    const without = gateAnswer({ output: run.result.output, facts: run.result.facts, allowedAddresses: new Set(run.result.addresses), chat: "group", placeholder: "-", levelWords: LEVEL_WORDS });
    expect(without.blocked).toBe("handle");
  });

  it("is still blocked when it sends people to a look-alike", async () => {
    const lookAlike = output("On help: message tonkfun_support_desk on Telegram.");
    const run = await runAnswer({ ...c, id: "look-alike" }, evalEnv(fakeModel(lookAlike), evalBudget(() => undefined, 1), Date.now(), DEFAULT_ANSWER_MODEL), null);
    expect(run.gated?.blocked).toBe("handle");
    expect(run.grade.failures).toContain('the gate blocked it (handle): members see "not sure"');
  });
});
