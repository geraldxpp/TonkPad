import { describe, expect, it } from "vitest";
import { ANSWERS_AT_ONCE, createAiLimits } from "../src/telegram/claude/limits";
import { userCode } from "../src/telegram/claude/user-code";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const S = 1_000;
const M = 60 * S;
const G1 = -1001111111111;
const G2 = -1002222222222;

/** n distinct users from `first`. */
const users = (n: number, first = 1_000) => Array.from({ length: n }, (_, i) => first + i);

describe("answer limits", () => {
  it("allow one answer per person every 15 seconds, groups and private chats together", () => {
    const limits = createAiLimits();
    expect(limits.answer(7, G1, T0)).toBe("ok");
    expect(limits.answer(7, null, T0 + 14 * S)).toBe("user");
    expect(limits.answer(7, null, T0 + 15 * S)).toBe("ok");
  });

  it("allow 8 answers per person in 10 minutes", () => {
    const limits = createAiLimits();
    for (let i = 0; i < 8; i += 1) expect(limits.answer(7, null, T0 + i * 20 * S)).toBe("ok");
    expect(limits.answer(7, null, T0 + 8 * 20 * S)).toBe("user");
    expect(limits.answer(7, null, T0 + 10 * M)).toBe("ok");
  });

  it("allow a group 4 answers a minute and 60 an hour", () => {
    const limits = createAiLimits();
    for (const user of users(4)) expect(limits.answer(user, G1, T0)).toBe("ok");
    expect(limits.answer(5_000, G1, T0 + 30 * S)).toBe("chat");
    expect(limits.answer(5_000, G2, T0 + 30 * S)).toBe("ok");
    const hourly = createAiLimits();
    for (let i = 0; i < 60; i += 1) expect(hourly.answer(10_000 + i, G1, T0 + Math.floor(i / 4) * M)).toBe("ok");
    expect(hourly.answer(20_000, G1, T0 + 20 * M)).toBe("chat");
    expect(hourly.answer(20_000, G1, T0 + 60 * M)).toBe("ok");
  });

  it("let one asker have at most 2 a minute in a group", () => {
    const limits = createAiLimits();
    expect(limits.answer(7, G1, T0)).toBe("ok");
    expect(limits.answer(7, G1, T0 + 15 * S)).toBe("ok");
    expect(limits.answer(7, G1, T0 + 30 * S)).toBe("chat");
    expect(limits.answer(7, G2, T0 + 30 * S)).toBe("ok");
    expect(limits.answer(7, G1, T0 + 60 * S)).toBe("ok");
  });

  it("allow 10 private answers a minute overall, and 30 answers a minute in all", () => {
    const limits = createAiLimits();
    for (const user of users(10)) expect(limits.answer(user, null, T0)).toBe("ok");
    expect(limits.answer(2_000, null, T0)).toBe("private");
    const groups = [G1, G2, -1003333333333, -1004444444444, -1005555555555];
    for (const [i, group] of groups.entries()) for (const user of users(4, 3_000 + i * 10)) expect(limits.answer(user, group, T0)).toBe("ok");
    expect(limits.answer(4_000, -1006666666666, T0)).toBe("global");
    expect(limits.answer(4_000, -1006666666666, T0 + M)).toBe("ok");
  });

  it("count nothing when they refuse", () => {
    const limits = createAiLimits();
    expect(limits.answer(7, G1, T0)).toBe("ok");
    for (let i = 0; i < 20; i += 1) expect(limits.answer(7, G1, T0 + S)).toBe("user");
    for (const user of users(3)) expect(limits.answer(user, G1, T0 + 2 * S)).toBe("ok");
  });
});

describe("the cooldown", () => {
  it("stops a person's answers for 10 minutes and says when a second refusal follows within them", () => {
    const limits = createAiLimits();
    expect(limits.coolDown(7, T0)).toBe(false);
    expect(limits.answer(7, null, T0 + 9 * M)).toBe("cooldown");
    expect(limits.answer(8, null, T0 + 9 * M)).toBe("ok");
    expect(limits.coolDown(7, T0 + 5 * M)).toBe(true);
    expect(limits.coolDown(7, T0 + 6 * M)).toBe(false);
    // The pause runs from the latest stop.
    expect(limits.answer(7, null, T0 + 15 * M)).toBe("cooldown");
    expect(limits.answer(7, null, T0 + 16 * M)).toBe("ok");
    expect(limits.coolDown(7, T0 + 30 * M)).toBe(false);
  });
});

describe("answers at once, and the busy reply to a dropped answer (model#4)", () => {
  it("let a group run 2 answers at once on Sonnet 5.5 and Opus 5.5, and 1 on Haiku 5.5", () => {
    expect(ANSWERS_AT_ONCE).toEqual({ "claude-haiku-5-5": 1, "claude-sonnet-5-5": 2, "claude-opus-5-5": 2 });
    expect(Object.isFrozen(ANSWERS_AT_ONCE)).toBe(true);
  });

  it("give each asker whose answer was dropped the busy reply at most once per 10 minutes", () => {
    const limits = createAiLimits();
    expect(limits.busyReply(7, T0)).toBe(true);
    expect(limits.busyReply(8, T0)).toBe(true);
    expect(limits.busyReply(7, T0 + 9 * M)).toBe(false);
    expect(limits.busyReply(7, T0 + 10 * M)).toBe(true);
    // Its own window: an asker's answers and other limits don't use it up.
    expect(limits.answer(9, G1, T0)).toBe("ok");
    expect(limits.coolDown(9, T0)).toBe(false);
    expect(limits.busyReply(9, T0)).toBe(true);
  });
});

describe("unprompted answers", () => {
  it("allow one every 3 minutes in a group, and the same member once per 10 minutes", () => {
    const limits = createAiLimits();
    expect(limits.proactive(G1, 7, T0)).toBe(true);
    expect(limits.proactive(G1, 8, T0 + 2 * M)).toBe(false);
    expect(limits.proactive(G2, 8, T0 + 2 * M)).toBe(true);
    expect(limits.proactive(G1, 7, T0 + 3 * M)).toBe(false);
    expect(limits.proactive(G1, 8, T0 + 3 * M)).toBe(true);
    expect(limits.proactive(G1, 7, T0 + 10 * M)).toBe(true);
  });

  it("allow 30 a UTC day in a group", () => {
    const limits = createAiLimits();
    const start = Date.UTC(2026, 10, 24, 0, 0, 0);
    for (let i = 0; i < 30; i += 1) expect(limits.proactive(G1, 1_000 + i, start + i * 3 * M)).toBe(true);
    expect(limits.proactive(G1, 5_000, start + 30 * 3 * M)).toBe(false);
    expect(limits.proactive(G2, 5_000, start + 30 * 3 * M)).toBe(true);
    expect(limits.proactive(G1, 5_001, Date.UTC(2026, 10, 25, 0, 0, 0))).toBe(true);
  });
});

describe("checks, reports and presses", () => {
  it("allow 30 checks a minute per group and 120 overall", () => {
    const limits = createAiLimits();
    for (let i = 0; i < 30; i += 1) expect(limits.triage(G1, T0)).toBe(true);
    expect(limits.triage(G1, T0)).toBe(false);
    for (let g = 2; g <= 4; g += 1) for (let i = 0; i < 30; i += 1) expect(limits.triage(-1000000000000 - g, T0)).toBe(true);
    expect(limits.triage(-1009999999999, T0)).toBe(false);
    expect(limits.triage(G1, T0 + M)).toBe(true);
  });

  it("allow 3 reports per person in 10 minutes and 8 presses in 10 seconds", () => {
    const limits = createAiLimits();
    for (let i = 0; i < 3; i += 1) expect(limits.report(7, T0 + i * M)).toBe(true);
    expect(limits.report(7, T0 + 9 * M)).toBe(false);
    expect(limits.report(8, T0 + 9 * M)).toBe(true);
    expect(limits.report(7, T0 + 10 * M)).toBe(true);
    for (let i = 0; i < 8; i += 1) expect(limits.press(7, T0 + i * S)).toBe(true);
    expect(limits.press(7, T0 + 9 * S)).toBe(false);
    expect(limits.press(7, T0 + 10 * S)).toBe(true);
  });
});

describe("prune", () => {
  it("forgets every user ID within 10 minutes of its last use", () => {
    const limits = createAiLimits();
    const user = 424_242;
    limits.answer(user, G1, T0);
    limits.answer(user, null, T0 + 20 * S);
    limits.proactive(G1, user, T0);
    limits.coolDown(user, T0 + M);
    limits.report(user, T0 + M);
    limits.press(user, T0 + M);
    limits.busyReply(user, T0 + M);
    limits.triage(G1, T0);
    const holds = (key: string) => key === String(user) || key.endsWith(`:${user}`);
    limits.prune(T0 + 2 * M);
    expect(limits.keys().some(holds)).toBe(true);
    limits.prune(T0 + 11 * M);
    expect(limits.keys().some(holds)).toBe(false);
    // Group keys may stay longer (the hourly window), but never a user's.
    expect(limits.keys().every((key) => !key.includes(String(user)))).toBe(true);
  });

  it("keeps memory bounded when thousands of accounts press at once", () => {
    const limits = createAiLimits();
    for (const user of users(10_001)) limits.press(user, T0);
    expect(limits.keys()).toHaveLength(10_001);
    limits.press(99_999_999, T0 + 11 * S);
    expect(limits.keys()).toEqual(["99999999"]);
  });
});

describe("userCode", () => {
  const key = "a".repeat(64);
  it("is 32 hex characters, stable within a UTC month", () => {
    const code = userCode(key, 7, Date.UTC(2026, 10, 1, 0, 0, 0));
    expect(code).toMatch(/^[0-9a-f]{32}$/);
    expect(userCode(key, 7, Date.UTC(2026, 10, 30, 23, 59, 59))).toBe(code);
  });

  it("differs across months, users and keys, and never shows the ID", () => {
    const code = userCode(key, 123_456_789, T0);
    expect(userCode(key, 123_456_789, Date.UTC(2026, 11, 1))).not.toBe(code);
    expect(userCode(key, 123_456_788, T0)).not.toBe(code);
    expect(userCode("b".repeat(64), 123_456_789, T0)).not.toBe(code);
    expect(code).not.toContain("123456789");
  });

  it("never throws on a broken clock", () => {
    expect(userCode(key, 7, Number.NaN)).toMatch(/^[0-9a-f]{32}$/);
  });
});
