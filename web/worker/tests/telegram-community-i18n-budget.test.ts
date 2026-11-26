import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import type { CommunityDictionary } from "../src/telegram/community/words";
import { COMMUNITY_DICTIONARIES } from "../src/telegram/i18n/community";
import { en } from "../src/telegram/i18n/community/en";

const CODES: Locale[] = LOCALES.map((l) => l.code);
const budget = (code: Locale): CommunityDictionary["admin"]["budget"] => COMMUNITY_DICTIONARIES[code].admin.budget;

/**
 * The admin chat's words for one kind of call (answers#13): the budget's
 * breaker pauses and restores moderation checks and AI answers on their
 * own (claude/budget-breaker.ts), and says which.
 */
const PER_KIND = ["circuitChecks", "circuitAnswers", "badRequestChecks", "badRequestAnswers", "backChecks", "backAnswers"] as const;

const ENGLISH: Record<(typeof PER_KIND)[number], string> = {
  circuitChecks: "Moderation checks are paused for a few minutes after repeated errors. The rules keep running, and links that relaxed mode would keep are held.",
  circuitAnswers: "AI answers are paused for a few minutes after repeated errors. Moderation checks keep running.",
  badRequestChecks: "Moderation checks are paused for 15 minutes: Anthropic rejected a check as malformed. If it happens again, check the worker's logs.",
  badRequestAnswers: "AI answers are paused for 15 minutes: Anthropic rejected a request as malformed. If it happens again, check the worker's logs.",
  backChecks: "Moderation checks are back on.",
  backAnswers: "AI answers are back on.",
};

/** English that a line translated only in part would still hold. */
const ENGLISH_LEFT = /moderation checks|AI answers|paused|back on|repeated errors|malformed|relaxed mode|happens again/i;

describe("the budget's words for one kind of call", () => {
  it("are the English lines decided for each kind's pause, bad request and return", () => {
    for (const key of PER_KIND) expect(en.admin.budget[key], key).toBe(ENGLISH[key]);
  });

  it.each(CODES)("%s tells each kind's lines apart, from each other and from the lines for every call", (code) => {
    const b = budget(code);
    const lines = [...PER_KIND.map((key) => b[key]), b.circuit, b.badRequest, b.restored];
    expect(new Set(lines).size).toBe(lines.length);
    // A bad request pauses its kind for 15 minutes, and Anthropic is who rejected it.
    for (const key of ["badRequestChecks", "badRequestAnswers"] as const) {
      expect(b[key], key).toContain("15");
      expect(b[key], key).toContain("Anthropic");
    }
    // The checks' pause names relaxed mode by the word the /mod panel shows for it.
    const relaxed = COMMUNITY_DICTIONARIES[code].admin.levels.relaxed.toLocaleLowerCase(code);
    expect(b.circuitChecks.toLocaleLowerCase(code)).toContain(relaxed);
  });

  it.each(CODES.filter((c) => c !== "en"))("%s translates every one of them, with no English left in any", (code) => {
    const b = budget(code);
    for (const key of PER_KIND) {
      expect(b[key], key).not.toBe(en.admin.budget[key]);
      expect(b[key], key).not.toMatch(ENGLISH_LEFT);
    }
  });
});
