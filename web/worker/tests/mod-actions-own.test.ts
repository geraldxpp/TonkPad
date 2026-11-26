import { describe, expect, it } from "vitest";
import type { ModAction, OffenceRecord, RuleCategory, RuleHit, Severity, Strictness, TriageVerdict } from "../src/telegram/community/types";
import { type DecideContext, decide, ownProtective } from "../src/telegram/mod/actions";

const DAY = 86_400;
const hit = (category: RuleCategory, certain = false, severity: Severity = "offence"): RuleHit => ({ category, severity, certain, detail: category });
const record = (n = 0, certain = 0): OffenceRecord => ({ n, certain, last: n > 0 ? 1 : 0, category: n > 0 ? "flood" : null });
const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({ standing: "member", strictness: "normal", offences: record(), raid: false, senderChat: false, stale: false, ...over });
const verdict = (v: TriageVerdict["verdict"]): TriageVerdict => ({ verdict: v, category: "phishing", question: "none", needs_human: "none", dm_scam_mention: false, language: "en", reason: "Promises free ETH." });
const kinds = (actions: readonly ModAction[] | undefined) => (actions ?? []).map((a) => (a.kind === "mute" ? `mute ${a.seconds}` : a.kind));

describe("decide: the bot's own words (own) are never punished for what they say", () => {
  const own = (over: Partial<DecideContext> = {}) => ctx({ own: true, ...over });

  it("keeps the rules' deletes and their alert, and drops every offence, warning, mute, ban and removal", () => {
    const cases: Array<[RuleHit, Partial<DecideContext>, readonly Strictness[]]> = [
      [hit("lookalike", true, "scam"), { standing: "new" }, ["relaxed", "normal", "strict"]],
      [hit("phishing", true, "scam"), {}, ["relaxed", "normal", "strict"]],
      [hit("link_raid", true, "scam"), { standing: "new" }, ["relaxed", "normal", "strict"]],
      [hit("fake_support", true, "scam"), { standing: "new" }, ["relaxed", "normal", "strict"]],
      [hit("newcomer_link", false, "notice"), { standing: "new", offences: record(2) }, ["relaxed", "normal", "strict"]],
      [hit("invite_link", true), { offences: record(3, 3) }, ["relaxed", "normal", "strict"]],
      [hit("unknown_link", false, "notice"), { offences: record(1) }, ["normal", "strict"]],
      [hit("risky_file"), { offences: record(2) }, ["relaxed", "normal", "strict"]],
    ];
    for (const [h, over, modes] of cases) {
      for (const strictness of modes) {
        const d = decide([h], null, own({ strictness, ...over }));
        const label = `${h.category} ${strictness}`;
        expect(kinds(d?.actions), label).toEqual(["delete"]);
        expect(d?.offence, label).toBe("none");
        expect(["warned", "muted", "banned"], label).not.toContain(d?.notice);
        expect(d?.alert, label).toBe("action");
      }
    }
  });

  it("still deletes a drainer's or a look-alike's link in observe mode, which protects members", () => {
    for (const category of ["lookalike", "phishing"] as const) {
      expect(decide([hit(category, true, "scam")], null, own({ strictness: "observe", standing: "new" }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", alert: "observe" });
    }
  });

  it("judges the member's own name and a flood alone when there are any: each deletes the message, and punishes", () => {
    expect(decide([hit("phishing", true, "scam"), hit("impersonation")], null, own())).toMatchObject({ category: "impersonation", actions: [{ kind: "delete" }, { kind: "mute", seconds: 7 * DAY }], offence: "model" });
    expect(kinds(decide([hit("name_link", true, "scam")], null, own())?.actions)).toEqual(["delete", "kick"]);
    expect(decide([hit("flood"), hit("phishing", true, "scam")], null, own({ standing: "new" }))).toMatchObject({ category: "flood", actions: [{ kind: "delete" }, { kind: "mute", seconds: 600 }], offence: "model" });
  });

  it("lets a verdict add nothing that bites, should one ever come", () => {
    for (const v of ["scam", "spam"] as const) {
      const d = decide([], verdict(v), own({ standing: "new", offences: record(4, 2) }));
      expect(kinds(d?.actions), v).toEqual(["delete"]);
      expect(d?.offence, v).toBe("none");
    }
  });

  it("changes nothing for the member's own words", () => {
    expect(kinds(decide([hit("phishing", true, "scam")], null, ctx({ standing: "new" }))?.actions)).toEqual(["delete", "ban"]);
    expect(kinds(decide([hit("phishing", true, "scam")], null, ctx())?.actions)).toEqual(["delete", `mute ${DAY}`]);
  });
});

describe("ownProtective: observe mode, when a personal hit decided words the member didn't write", () => {
  const observe = (over: Partial<DecideContext> = {}) => ctx({ own: true, strictness: "observe", ...over });

  it("keeps the protective delete the rest of the hits ask for, with no sanction, though the personal hit's decision deletes nothing", () => {
    for (const category of ["lookalike", "phishing"] as const) {
      for (const personal of [hit("flood"), hit("name_link", true, "scam"), hit("impersonation")]) {
        for (const standing of ["new", "member"] as const) {
          const hits = [hit(category, true, "scam"), hit("unknown_link", false, "notice"), personal];
          const label = `${category} ${personal.category} ${standing}`;
          expect(kinds(decide(hits, null, observe({ standing }))?.actions), label).toEqual([]);
          expect(ownProtective(hits, observe({ standing })), label).toMatchObject({ category, actions: [{ kind: "delete" }], offence: "none", notice: "removed", alert: "observe", observeOnly: true });
        }
      }
    }
  });

  it("is nothing without a protective hit or a personal one, outside observe mode, for the member's own words, or after downtime", () => {
    const flooded = [hit("lookalike", true, "scam"), hit("flood")];
    expect(ownProtective([hit("unknown_link", false, "notice"), hit("flood")], observe())).toBeNull();
    // With no personal hit, decide() itself already keeps the delete.
    expect(ownProtective([hit("lookalike", true, "scam")], observe())).toBeNull();
    expect(kinds(decide([hit("lookalike", true, "scam")], null, observe())?.actions)).toEqual(["delete"]);
    for (const strictness of ["relaxed", "normal", "strict"] as const) {
      expect(ownProtective(flooded, observe({ strictness })), strictness).toBeNull();
      expect(kinds(decide(flooded, null, observe({ strictness }))?.actions)[0], strictness).toBe("delete");
    }
    expect(ownProtective(flooded, observe({ own: false }))).toBeNull();
    expect(ownProtective(flooded, observe({ stale: true }))).toBeNull();
    expect(ownProtective(flooded, observe({ standing: "admin" }))).toBeNull();
  });
});

describe("decide: what relaxed mode keeps up for Haiku's check", () => {
  const relaxed = (over: Partial<DecideContext> = {}) => ctx({ strictness: "relaxed", ...over });
  const brand = [hit("brand_forward", false, "alert")];
  const link = [hit("unknown_link", false, "alert")];
  const KEPT = { actions: [], offence: "none", notice: null, alert: "action", source: "rule" };

  it("keeps a member's brand forward up and tells the team, since the check may never read it; a raid removes it", () => {
    expect(decide(brand, null, relaxed())).toMatchObject({ ...KEPT, category: "brand_forward" });
    // In a raid the notices are summed up (mod/raid.ts): none of its own.
    expect(decide(brand, null, relaxed({ raid: true }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", notice: null, alert: "action" });
  });

  it("adds what Haiku's verdict finds to the kept forward, as before", () => {
    expect(decide(brand, verdict("scam"), relaxed())).toMatchObject({ category: "model_scam", actions: [{ kind: "delete" }, { kind: "mute", seconds: DAY }], offence: "model" });
    expect(decide(brand, verdict("ok"), relaxed())).toBeNull();
  });

  it("leaves a member's unknown link to the check, but tells the team of one in the bot's own words, which the check never reads", () => {
    expect(decide(link, null, relaxed())).toBeNull();
    expect(decide(link, null, relaxed({ own: true }))).toMatchObject({ ...KEPT, category: "unknown_link" });
    expect(decide(link, null, relaxed({ own: true, raid: true }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none" });
  });
});
