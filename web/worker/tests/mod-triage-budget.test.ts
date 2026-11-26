// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createBudget } from "../src/telegram/claude/budget";
import { type Budget, type ClaudeOutcome, UNSENT } from "../src/telegram/claude/types";
import { triageMessage } from "../src/telegram/mod/triage";
import { failure, fakeClaude } from "./community-fixtures";
import { NOW } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";
import { INPUT, OFFICIAL } from "./mod-triage-fixtures";

/** The real ledger (claude/budget.ts): the bot's own split, nothing saved, AI on. */
const ledger = (): Budget =>
  createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: () => undefined, now: () => NOW });

/** One check that ends in `outcome`, at `at`. */
const check = (outcome: ClaudeOutcome, budget: Budget, at = NOW) =>
  triageMessage(INPUT, { client: fakeClaude([outcome]), budget, official: OFFICIAL, allow: ALLOW, now: () => at }, null);

/** claude/budget.ts gives checks a breaker of their own, and releases a request that never left the worker: triage.ts must tell it both. */
describe("triageMessage settles with the real ledger", () => {
  it("makes only checks wait out a ramp limit: answers go on", async () => {
    const budget = ledger();
    expect(await check(failure("ramp", 429, 30_000), budget)).toBeNull();
    expect(budget.available("triage", NOW)).toBe(false);
    expect(budget.available("group", NOW)).toBe(true);
    expect(budget.available("triage", NOW + 30_000)).toBe(true);
  });

  it("pauses only checks after 5 failed checks in 5 minutes", async () => {
    const budget = ledger();
    for (let i = 0; i < 5; i += 1) expect(await check(failure("overloaded", 529), budget, NOW + i * 1_000)).toBeNull();
    const after = NOW + 5_000;
    expect(budget.available("triage", after)).toBe(false);
    expect(budget.available("group", after)).toBe(true);
    expect(budget.status(after)).toMatchObject({ reason: "circuit", errors: 5 });
  });

  it("releases a check that was never sent, and charges one that may have been billed", async () => {
    const unsent = ledger();
    const never: ClaudeOutcome = { ok: false, failure: "network", type: UNSENT, status: null, retryAfterMs: null };
    expect(await check(never, unsent)).toBeNull();
    expect(unsent.status(NOW).lanes.triage).toMatchObject({ spentUsd: 0, calls: 1 });
    const lost = ledger();
    expect(await check(failure("network"), lost)).toBeNull();
    expect(lost.status(NOW).lanes.triage.spentUsd).toBeGreaterThan(0);
  });
});
