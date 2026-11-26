import { describe, expect, it } from "vitest";
import { ANSWERED_MAX, ANSWERED_MS, AnsweredMap } from "../src/telegram/agent/answered";
import { GROUP_ID } from "./community-fixtures";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const S = 1_000;

describe("the answered-question map", () => {
  it("finds a question's answer for 48 hours, then never again", () => {
    const map = new AnsweredMap();
    map.note(GROUP_ID, 10, 5_001, T0);
    expect(map.answerOf(GROUP_ID, 10, T0 + ANSWERED_MS - 1)).toBe(5_001);
    expect(map.answerOf(GROUP_ID, 11, T0)).toBeNull();
    expect(map.answerOf(-1009999999999, 10, T0)).toBeNull();
    expect(map.answerOf(GROUP_ID, 10, T0 + ANSWERED_MS)).toBeNull();
    expect(map.answerOf(GROUP_ID, 10, T0)).toBeNull();
  });

  it("forgets a pair on request, and old ones when pruned", () => {
    const map = new AnsweredMap();
    map.note(GROUP_ID, 10, 5_001, T0);
    map.note(GROUP_ID, 11, 5_002, T0 + S);
    map.forget(GROUP_ID, 10);
    expect(map.answerOf(GROUP_ID, 10, T0 + S)).toBeNull();
    map.note(GROUP_ID, 12, 5_003, T0 + ANSWERED_MS);
    map.prune(T0 + S + ANSWERED_MS);
    expect(map.answerOf(GROUP_ID, 11, T0)).toBeNull();
    expect(map.answerOf(GROUP_ID, 12, T0 + ANSWERED_MS)).toBe(5_003);
  });

  it("keeps at most 5,000 pairs, dropping the oldest first", () => {
    const map = new AnsweredMap();
    for (let id = 1; id <= ANSWERED_MAX; id += 1) map.note(GROUP_ID, id, 100_000 + id, T0);
    map.note(GROUP_ID, 1, 7, T0 + S);
    map.note(GROUP_ID, ANSWERED_MAX + 1, 8, T0 + S);
    expect(map.answerOf(GROUP_ID, 2, T0 + S)).toBeNull();
    expect(map.answerOf(GROUP_ID, 1, T0 + S)).toBe(7);
    expect(map.answerOf(GROUP_ID, 3, T0 + S)).toBe(100_003);
    expect(map.answerOf(GROUP_ID, ANSWERED_MAX + 1, T0 + S)).toBe(8);
  });
});
