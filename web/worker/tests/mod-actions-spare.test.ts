import { describe, expect, it } from "vitest";
import { type ModAction, type OffenceRecord, type RuleCategory, type RuleHit, type Severity, STRICTNESS_LEVELS, type TriageVerdict } from "../src/telegram/community/types";
import { type DecideContext, decide } from "../src/telegram/mod/actions";
import { decideBot } from "../src/telegram/mod/actions-decide";

const hit =(category: RuleCategory, certain = false, severity: Severity = "offence"): RuleHit => ({ category, severity, certain, detail: category });
const record = (n = 0, certain = 0): OffenceRecord => ({ n, certain, last: n > 0 ? 1 : 0, category: n > 0 ? "flood" : null });
const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({ standing: "member", strictness: "normal", offences: record(), raid: false, senderChat: false, stale: false, ...over });
const verdict = (v: TriageVerdict["verdict"]): TriageVerdict => ({ verdict: v, category: "phishing", question: "none", needs_human: "none", dm_scam_mention: false, language: "en", reason: "Doubling scam." });
const kinds = (actions: readonly ModAction[] | undefined) => (actions ?? []).map((a) => (a.kind === "mute" ? `mute ${a.seconds}` : a.kind));
const RAID = hit("link_raid", true, "scam");

describe("decide: a link raid's copies", () => {
  it("bans a raider who is a new member, with an alert that offers Unban", () => {
    expect(decide([RAID], null, ctx({ standing: "new" }))).toMatchObject({ actions: [{ kind: "delete" }, { kind: "ban" }], offence: "certain", alert: "action" });
  });

  it("only deletes a member's or trusted member's copy: never an offence, a mute or a ban, and the team still hears of it", () => {
    for (const strictness of ["relaxed", "normal", "strict"] as const) {
      for (const standing of ["member", "trusted"] as const) {
        for (const offences of [record(), record(3, 2)]) {
          const d = decide([RAID], null, ctx({ standing, strictness, offences }));
          expect(d, `${standing} ${strictness}`).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", alert: "action" });
        }
      }
    }
  });

  it("only deletes a channel identity's copy, as a member's", () => {
    expect(decide([RAID], null, ctx({ senderChat: true }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none" });
    // A real scam still bans the identity.
    expect(kinds(decide([hit("lookalike", true, "scam")], null, ctx({ senderChat: true }))?.actions)).toEqual(["delete", "ban_sender_chat"]);
  });

  it("only reports a copy in observe mode", () => {
    expect(decide([RAID], null, ctx({ strictness: "observe", standing: "new" }))).toMatchObject({ actions: [], alert: "observe", offence: "none" });
  });
});

describe("decide: a member's unknown link reaches the team", () => {
  it("sends a routine action alert for a normal-mode removal, and for relaxed mode's in a raid", () => {
    const link = [hit("unknown_link", false, "notice")];
    expect(decide(link, null, ctx())).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", notice: "removed", alert: "action" });
    expect(decide(link, null, ctx({ strictness: "relaxed", raid: true }))).toMatchObject({ actions: [{ kind: "delete" }], alert: "action" });
    expect(decide(link, null, ctx({ strictness: "relaxed" }))).toBeNull();
  });
});

describe("decide: someone at risk is never punished", () => {
  const spare = (over: Partial<DecideContext> = {}) => ctx({ spare: true, ...over });

  it("keeps the rules' deletes but drops every offence, mute, ban and removal", () => {
    const cases: Array<[RuleHit, Partial<DecideContext>]> = [
      [hit("flood"), {}],
      [hit("risky_file"), { standing: "new" }],
      [hit("invite_link", true), { offences: record(3, 3) }],
      [hit("lookalike", true, "scam"), { standing: "new" }],
      [hit("phishing", true, "scam"), {}],
      [RAID, { standing: "new" }],
      [hit("fake_support", true, "scam"), { standing: "new" }],
      [hit("newcomer_link", false, "notice"), { standing: "new", offences: record(2) }],
      [hit("name_link", true, "scam"), {}],
      [hit("unknown_link", false, "notice"), { strictness: "strict", offences: record(1) }],
    ];
    for (const [h, over] of cases) {
      const d = decide([h], null, spare(over));
      expect(kinds(d?.actions), h.category).toEqual(["delete"]);
      expect(d?.offence, h.category).toBe("none");
      expect(["warned", "muted", "banned"]).not.toContain(d?.notice);
    }
  });

  it("lets Haiku's scam or spam verdict delete, never punish", () => {
    for (const v of ["scam", "spam"] as const) {
      const d = decide([], verdict(v), spare({ standing: "new", offences: record(4, 2) }));
      expect(kinds(d?.actions), v).toEqual(["delete"]);
      expect(d?.offence, v).toBe("none");
    }
    // A link the rules already removed: nothing more to do, and nothing more to report.
    expect(decide([hit("unknown_link", false, "notice")], verdict("scam"), spare())).toBeNull();
  });

  it("still removes secrets with their own notice, and never bans a channel identity", () => {
    for (const strictness of STRICTNESS_LEVELS) expect(decide([hit("secret", true, "protect")], null, spare({ strictness }))).toMatchObject({ actions: [{ kind: "delete" }], notice: "secret" });
    expect(kinds(decide([hit("lookalike", true, "scam")], null, spare({ senderChat: true }))?.actions)).toEqual(["delete"]);
  });

  it("changes nothing when there is nothing to delete", () => {
    expect(decide([hit("abuse", false, "alert")], null, spare())).toMatchObject({ actions: [{ kind: "delete" }], offence: "none" });
    expect(decide([], verdict("unsure"), spare())).toMatchObject({ actions: [], alert: "unsure" });
    expect(decide([], verdict("ok"), spare())).toBeNull();
  });
});

describe("decideBot: another bot's message", () => {
  it("deletes it and bans the bot on a certain rule's hit", () => {
    for (const category of ["secret", "lookalike", "phishing", "invite_link", "risky_file"] as const) {
      const d = decideBot([hit(category, category !== "risky_file", "scam")], ctx());
      expect(d, category).toMatchObject({ actions: [{ kind: "delete" }, { kind: "ban" }], category, offence: "none", notice: null, alert: "action" });
    }
  });

  it("leaves every other hit alone", () => {
    for (const category of ["unknown_link", "newcomer_link", "impersonation", "name_link", "flood", "abuse", "contact_info", "fake_support"] as const) {
      expect(decideBot([hit(category, true)], ctx()), category).toBeNull();
    }
    expect(decideBot([], ctx())).toBeNull();
  });

  it("only deletes protective cases in observe mode, and only deletes certain ones after downtime", () => {
    expect(decideBot([hit("lookalike", true, "scam")], ctx({ strictness: "observe" }))).toMatchObject({ actions: [{ kind: "delete" }], alert: "observe" });
    expect(decideBot([hit("invite_link", true)], ctx({ strictness: "observe" }))).toMatchObject({ actions: [], alert: "observe" });
    expect(decideBot([hit("phishing", true, "scam")], ctx({ stale: true }))).toMatchObject({ actions: [{ kind: "delete" }], alert: null });
    expect(decideBot([hit("risky_file", false)], ctx({ stale: true }))).toBeNull();
  });
});
