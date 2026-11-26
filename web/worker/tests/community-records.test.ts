// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RuleCategory, Strictness } from "../src/telegram/community/types";
import { GROUP_ID } from "./community-fixtures";
import { check, DAY, DEFAULTS, HOUR, KIM, LEE, MINUTE, NAME, OTHER_GROUP, SAM, setup } from "./community-records-setup";
import { NOW } from "./fixtures";

describe("community records", () => {
  it("starts each group from its defaults and keeps an owner's changes", () => {
    const { records, saves } = setup();
    expect(records.settings(GROUP_ID)).toEqual(DEFAULTS);
    records.updateSettings(GROUP_ID, { strictness: "normal" });
    records.updateSettings(GROUP_ID, { raidUntil: NOW + 30 * MINUTE, paused: true });
    expect(records.settings(GROUP_ID)).toEqual({ paused: true, proactive: true, strictness: "normal", raidUntil: NOW + 30 * MINUTE });
    expect(records.settings(OTHER_GROUP)).toEqual(DEFAULTS);
    expect(saves()).toBe(2);
    records.updateSettings(GROUP_ID, { strictness: "chaos" as Strictness });
    records.updateSettings(GROUP_ID, { raidUntil: Number.NaN });
    records.settings(GROUP_ID).strictness = "strict";
    expect(records.settings(GROUP_ID).strictness).toBe("normal");
    expect(saves()).toBe(2);
  });

  it("counts offences until 7 days after the last, with how many were rule-certain", () => {
    const { records } = setup();
    expect(records.addOffence(GROUP_ID, SAM, NOW, "unknown_link", false)).toEqual({ n: 1, certain: 0, last: NOW, category: "unknown_link" });
    expect(records.addOffence(GROUP_ID, SAM, NOW + HOUR, "lookalike", true)).toMatchObject({ n: 2, certain: 1, category: "lookalike" });
    const last = NOW + 2 * HOUR;
    expect(records.addOffence(GROUP_ID, SAM, last, "model_spam", false)).toEqual({ n: 3, certain: 1, last, category: "model_spam" });
    expect(records.offences(GROUP_ID, SAM, last + 7 * DAY - 1)).toMatchObject({ n: 3, certain: 1 });
    expect(records.offences(GROUP_ID, SAM, last + 7 * DAY)).toEqual({ n: 0, certain: 0, last: 0, category: null });
    expect(records.offences(GROUP_ID, KIM, last).n).toBe(0);
    expect(records.offences(OTHER_GROUP, SAM, last).n).toBe(0);
    // After the window, the ladder starts again.
    expect(records.addOffence(GROUP_ID, SAM, last + 7 * DAY, "flood", false)).toMatchObject({ n: 1, certain: 0 });
    // A reason it doesn't know is kept as none, never as text.
    expect(records.addOffence(GROUP_ID, KIM, NOW, "said hello" as RuleCategory, true)).toMatchObject({ n: 1, certain: 1, category: null });
  });

  it("undoes the latest offence without leaving a certain count behind", () => {
    const { records, state, saves } = setup();
    records.addOffence(GROUP_ID, SAM, NOW, "model_spam", false);
    records.addOffence(GROUP_ID, SAM, NOW, "lookalike", true);
    expect(records.removeOffence(GROUP_ID, SAM)).toMatchObject({ n: 1, certain: 0 });
    records.addOffence(GROUP_ID, KIM, NOW, "lookalike", true);
    records.addOffence(GROUP_ID, KIM, NOW, "phishing", true);
    expect(records.removeOffence(GROUP_ID, KIM)).toMatchObject({ n: 1, certain: 1 });
    expect(records.removeOffence(GROUP_ID, KIM)).toEqual({ n: 0, certain: 0, last: 0, category: null });
    expect(state.warnings[String(GROUP_ID)][String(KIM)]).toBeUndefined();
    const before = saves();
    expect(records.removeOffence(GROUP_ID, LEE).n).toBe(0);
    expect(saves()).toBe(before);
  });

  it("trusts a member under the name they had then, until an admin removes it", () => {
    const { records, state, saves } = setup();
    records.trust(GROUP_ID, SAM, NAME, NOW);
    records.trust(GROUP_ID, KIM, "Kim Jones", NOW + 1);
    expect(records.isTrusted(GROUP_ID, SAM)).toBe(true);
    expect(records.trustedName(GROUP_ID, SAM, NAME)).toBe(true);
    expect(records.trustedName(GROUP_ID, SAM, "fedcba9876543210")).toBe(false);
    expect(records.trustedName(GROUP_ID, LEE, NAME)).toBe(false);
    expect(records.isTrusted(OTHER_GROUP, SAM)).toBe(false);
    // A name passed by mistake is kept only as a fingerprint, and still compared exactly.
    expect(state.trusted[String(GROUP_ID)][String(KIM)].name).toMatch(/^[0-9a-f]{16}$/);
    expect(records.trustedName(GROUP_ID, KIM, "Kim Jones")).toBe(true);
    expect(records.trustedName(GROUP_ID, KIM, "Kim Jone5")).toBe(false);
    expect(records.trusted(GROUP_ID)).toEqual([SAM, KIM]);
    records.prune(NOW + 365 * DAY);
    expect(records.trusted(GROUP_ID)).toEqual([SAM, KIM]);
    records.untrust(GROUP_ID, SAM);
    expect(records.isTrusted(GROUP_ID, SAM)).toBe(false);
    expect(records.trusted(GROUP_ID)).toEqual([KIM]);
    expect(saves()).toBe(3);
  });

  it("lists everyone on one shared check, and the checks that are due", () => {
    const { records, saves } = setup();
    records.setPending(check(SAM));
    records.setPending(check(KIM));
    records.setPending(check(LEE, { messageId: 600, deadline: NOW + 3 * MINUTE, target: 7 }));
    expect(records.pendingOn(GROUP_ID, 500).map((p) => p.user)).toEqual([SAM, KIM]);
    expect(records.pendingOn(GROUP_ID, 600)).toEqual([check(LEE, { messageId: 600, deadline: NOW + 3 * MINUTE, target: 7 })]);
    expect(records.pendingOn(OTHER_GROUP, 500)).toEqual([]);
    expect(records.duePending(NOW + 3 * MINUTE).map((p) => p.user)).toEqual([LEE]);
    expect(records.duePending(NOW + 5 * MINUTE)).toHaveLength(3);
    records.dropPending(GROUP_ID, KIM);
    expect(records.pendingOn(GROUP_ID, 500).map((p) => p.user)).toEqual([SAM]);
    // Written as they are restricted, before the check is posted: message ID 0 until it is.
    records.setPending(check(KIM, { messageId: 0 }));
    expect(records.pending(GROUP_ID, KIM)?.messageId).toBe(0);
    expect(records.pendingIn(GROUP_ID).map((p) => p.user)).toEqual([SAM, LEE, KIM]);
    expect(records.pendingIn(OTHER_GROUP)).toEqual([]);
    records.dropPending(GROUP_ID, KIM);
    // A message ID that isn't one, or a deadline that isn't a time, is never kept.
    records.setPending(check(KIM, { messageId: -1 }));
    records.setPending(check(KIM, { deadline: Number.NaN }));
    expect(records.pending(GROUP_ID, KIM)).toBeNull();
    const mine = records.pending(GROUP_ID, SAM);
    if (mine) mine.tries = 9;
    expect(records.pending(GROUP_ID, SAM)?.tries).toBe(0);
    expect(saves()).toBe(6);
  });

  it("forgets everything about one member in one group", () => {
    const { records, state, saves } = setup();
    for (const [chat, user] of [[GROUP_ID, SAM], [GROUP_ID, KIM], [OTHER_GROUP, SAM]]) {
      records.addOffence(chat, user, NOW, "invite_link", true);
      records.markNewcomer(chat, user, NOW, NOW + DAY);
      records.setPending(check(user, { chat }));
      records.trust(chat, user, NAME, NOW);
      records.markAppeal(chat, user, NOW);
    }
    records.forgetMember(GROUP_ID, SAM);
    for (const map of [state.warnings, state.newcomers, state.trusted, state.appeals]) {
      expect(map[String(GROUP_ID)][String(SAM)]).toBeUndefined();
      expect(map[String(GROUP_ID)][String(KIM)]).toBeDefined();
      expect(map[String(OTHER_GROUP)][String(SAM)]).toBeDefined();
    }
    expect(Object.keys(state.pending)).toEqual([`${GROUP_ID}:${KIM}`, `${OTHER_GROUP}:${SAM}`]);
    expect(records.offences(GROUP_ID, SAM, NOW).n).toBe(0);
    expect(records.isNewcomer(GROUP_ID, SAM, NOW)).toBe(false);
    expect(records.appealAt(GROUP_ID, SAM)).toBeNull();
    const before = saves();
    records.forgetMember(GROUP_ID, SAM);
    records.forgetMember(OTHER_GROUP, LEE);
    expect(saves()).toBe(before);
  });

  it("forgets every member's records in a group no longer on the allow-list, trusted members included", () => {
    const { records, state, saves } = setup();
    for (const chat of [GROUP_ID, OTHER_GROUP]) {
      records.addOffence(chat, SAM, NOW, "invite_link", true);
      records.markNewcomer(chat, KIM, NOW, NOW + DAY);
      records.setPending(check(LEE, { chat }));
      records.trust(chat, SAM, NAME, NOW);
      records.markAppeal(chat, SAM, NOW);
      records.count(chat, "removed", NOW);
      records.updateSettings(chat, { strictness: "strict" });
    }
    const before = saves();
    records.forgetChatsExcept([GROUP_ID]);
    expect(saves()).toBe(before + 1);
    for (const map of [state.warnings, state.newcomers, state.trusted, state.appeals]) {
      expect(map[String(OTHER_GROUP)]).toBeUndefined();
      expect(map[String(GROUP_ID)]).toBeDefined();
    }
    expect(Object.keys(state.pending)).toEqual([`${GROUP_ID}:${LEE}`]);
    expect(records.isTrusted(OTHER_GROUP, SAM)).toBe(false);
    expect(records.isTrusted(GROUP_ID, SAM)).toBe(true);
    // A group's settings and day counts hold no IDs: they stay, in case it comes back.
    expect(records.settings(OTHER_GROUP).strictness).toBe("strict");
    expect(records.counts(OTHER_GROUP, NOW).removed).toBe(1);
    records.forgetChatsExcept([GROUP_ID, OTHER_GROUP]);
    expect(saves()).toBe(before + 1);
    records.forgetChatsExcept([]);
    expect(state.trusted).toEqual({});
    expect(state.pending).toEqual({});
  });

  it("keeps the day's spend and the AI-off switch as given, and refuses anything else", () => {
    const { records, saves } = setup();
    const spend = { day: "2026-11-06", lanes: { triage: 0.5, group: 0.25, proactive: 0.1, private: 0 } };
    records.setSpend(spend);
    records.setSpend({ day: "today", lanes: spend.lanes });
    expect(records.spend()).toEqual(spend);
    records.setAiOff({ reason: "billing", since: NOW });
    records.setAiOff({ reason: "bored" as "admin", since: NOW });
    expect(records.aiOff()).toEqual({ reason: "billing", since: NOW });
    records.setAiOff(null);
    expect(records.aiOff()).toBeNull();
    expect(saves()).toBe(3);
  });
});
