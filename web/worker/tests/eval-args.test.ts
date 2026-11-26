// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP, parseArgs } from "../evals/agent/run-args";

/**
 * The offline eval's command line (worker/evals/agent/run-args.ts): its
 * options, what it says about a wrong one, and --help's list of the
 * deterministic cases, which names only tests that exist. Nothing runs.
 */

const TESTS = fileURLToPath(new URL(".", import.meta.url));
/** The test files --help names, after "npm test runs them". */
const named: readonly string[] = (HELP.split("npm test runs them")[1] ?? "").match(/\b(?:agent|community|eval|mod|telegram)(?:-[a-z]+)+\b/g) ?? [];

describe("the eval's options", () => {
  it("takes --yes, --help and --count-tokens, and --model, --lang, --effort and --only with a value, spaced or after =", () => {
    expect(parseArgs([])).toEqual({ yes: false, help: false, model: "claude-sonnet-5-5", lang: null, only: [], effort: null, countTokens: false });
    expect(parseArgs(["--yes", "--model", "claude-haiku-5-5", "--lang", "ru", "--effort=medium", "--only", "fees-curve, hf-crisis-en", "--only=mod-spam-volume-en", "--count-tokens"])).toEqual({
      yes: true,
      help: false,
      model: "claude-haiku-5-5",
      lang: "ru",
      only: ["fees-curve", "hf-crisis-en", "mod-spam-volume-en"],
      effort: "medium",
      countTokens: true,
    });
    expect(parseArgs(["-h"])).toMatchObject({ help: true, yes: false });
    expect(parseArgs(["--lang=es", "--effort", "low"])).toMatchObject({ lang: "es", effort: "low", model: "claude-sonnet-5-5" });
    expect(parseArgs(["--model=Claude-Opus-5-5", "--effort", "high"])).toMatchObject({ model: "claude-opus-5-5", effort: "high" });
  });

  it("takes the answers' model from TELEGRAM_AI_ANSWER_MODEL without --model, and --model over it", () => {
    expect(parseArgs([], { TELEGRAM_AI_ANSWER_MODEL: " claude-opus-5-5 " })).toMatchObject({ model: "claude-opus-5-5" });
    expect(parseArgs(["--model", "claude-haiku-5-5"], { TELEGRAM_AI_ANSWER_MODEL: "claude-opus-5-5" })).toMatchObject({ model: "claude-haiku-5-5" });
    expect(parseArgs([], { TELEGRAM_AI_ANSWER_MODEL: "" })).toMatchObject({ model: "claude-sonnet-5-5" });
    expect(parseArgs([], { TELEGRAM_AI_ANSWER_MODEL: "claude-opus-4-8" })).toBe(
      "TELEGRAM_AI_ANSWER_MODEL in this shell isn't claude-sonnet-5-5, claude-opus-5-5 or claude-haiku-5-5: fix it, or pass --model.",
    );
  });

  it("says what's wrong instead of guessing", () => {
    for (const lang of [["--lang", "en"], ["--lang", "xx"], ["--lang"]]) expect(parseArgs(lang)).toMatch(/^--lang takes one of the site's languages other than en/);
    expect(parseArgs(["--model", "claude-haiku-5-5", "--effort", "high"])).toBe(
      "--effort takes low or medium with claude-haiku-5-5: its answers run at high, and this reruns them at another level to compare.",
    );
    expect(parseArgs(["--effort", "medium"])).toMatch(/^--effort takes low or high with claude-sonnet-5-5: its answers run at medium/);
    expect(parseArgs(["--effort", "max"])).toMatch(/^--effort takes low, medium, high/);
    for (const model of [["--model", "claude-opus-4-8"], ["--model", "opus"], ["--model"]]) expect(parseArgs(model)).toBe("--model takes claude-sonnet-5-5, claude-opus-5-5 or claude-haiku-5-5.");
    expect(parseArgs(["--only", " , "])).toBe("--only takes one or more case IDs, comma-separated.");
    expect(parseArgs(["--yes", "--fast"])).toBe("Unknown option: --fast");
  });
});

describe("--help's list of the deterministic cases", () => {
  it("names only tests that exist, the gate's and the Q&A flow's newer ones among them", () => {
    expect(named.length).toBeGreaterThan(25);
    expect(named.filter((name) => !existsSync(join(TESTS, `${name}.test.ts`)))).toEqual([]);
    const newer = ["agent-gate-families", "agent-gate-hidden", "agent-gate-negation", "agent-gate-spelled", "community-qa-warning", "community-qa-pause", "community-qa-press"];
    expect(newer.filter((name) => !named.includes(name))).toEqual([]);
  });
});
