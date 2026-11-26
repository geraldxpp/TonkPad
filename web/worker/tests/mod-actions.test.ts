import { describe, expect, it } from "vitest";
import { type ModAction, type OffenceRecord, type RuleCategory, type RuleHit, type Severity, STRICTNESS_LEVELS, type TriageVerdict } from "../src/telegram/community/types";
import { type DecideContext, decide } from "../src/telegram/mod/actions";
import { ladderStep } from "../src/telegram/mod/ladder";

const DAY = 86_400;
const hit = (category: RuleCategory, certain = false, severity: Severity = "offence"): RuleHit => ({ category, severity, certain, detail: category });
const record = (n = 0, certain = 0): OffenceRecord => ({ n, certain, last: n > 0 ? 1 : 0, category: n > 0 ? "flood" : null });
const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({ standing: "member", strictness: "normal", offences: record(), raid: false, senderChat: false, stale: false, ...over });
const verdict = (v: TriageVerdict["verdict"]): TriageVerdict => ({ verdict: v, category: "phishing", question: "none", needs_human: "none", dm_scam_mention: false, language: "en", reason: "Asks people to connect a wallet." });
const kinds = (actions: readonly ModAction[] | undefined) => (actions ?? []).map((a) => (a.kind === "mute" ? `mute ${a.seconds}` : a.kind));
const bans = (actions: readonly ModAction[] | undefined) => (actions ?? []).some((a) => a.kind === "ban");

const mute = (s: number): ModAction => ({ kind: "mute", seconds: s });

describe("ladderStep", () => {
  it("follows each strictness's table, the offence already counted", () => {
    const steps = (s: "relaxed" | "normal" | "strict") => [1, 2, 3, 4, 5, 6].map((n) => kinds([ladderStep(s, record(n, 1))]).join());
    expect(steps("relaxed")).toEqual(["warn", "warn", "mute 3600", "mute 86400", "ban", "ban"]);
    expect(steps("normal")).toEqual(["warn", "mute 3600", "mute 86400", "ban", "ban", "ban"]);
    expect(steps("strict")).toEqual(["mute 3600", "mute 86400", "ban", "ban", "ban", "ban"]);
  });

  it("bans only with a rule-certain offence in the window; otherwise stops at a 24-hour mute", () => {
    for (const s of STRICTNESS_LEVELS) for (let n = 1; n <= 12; n += 1) expect(ladderStep(s, record(n, 0))).not.toEqual({ kind: "ban" });
    expect(ladderStep("normal", record(9, 0))).toEqual(mute(DAY));
    expect(ladderStep("strict", record(3, 1))).toEqual({ kind: "ban" });
  });
});

describe("decide: rules", () => {
  it("never moderates admins", () => {
    for (const h of [hit("lookalike", true, "scam"), hit("secret", true, "protect"), hit("flood")]) expect(decide([h], verdict("scam"), ctx({ standing: "admin" }))).toBeNull();
    expect(decide([hit("flood")], null, ctx({ standing: "admin" }))).toBeNull();
  });

  it("deletes secrets in every mode with the neutral notice and an alert, never an offence", () => {
    for (const strictness of STRICTNESS_LEVELS) {
      for (const standing of ["new", "member", "trusted"] as const) {
        const d = decide([hit("secret", true, "protect"), hit("lookalike", true, "scam")], null, ctx({ strictness, standing }));
        expect(d).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", notice: "secret", alert: "secret" });
      }
    }
    expect(decide([hit("secret_probable", false, "protect")], null, ctx())).toMatchObject({ notice: "secret_probable", offence: "none" });
  });

  it("bans a new member's certain scam and mutes anyone else for 24 hours", () => {
    for (const category of ["lookalike", "phishing"] as const) {
      expect(kinds(decide([hit(category, true, "scam")], null, ctx({ standing: "new" }))?.actions)).toEqual(["delete", "ban"]);
      expect(kinds(decide([hit(category, true, "scam")], null, ctx())?.actions)).toEqual(["delete", `mute ${DAY}`]);
      expect(kinds(decide([hit(category, true, "scam")], null, ctx({ standing: "trusted" }))?.actions)).toEqual(["delete", `mute ${DAY}`]);
    }
    // A link raid bans only a new member; anyone else's copy is deleted (mod-actions-spare.test.ts).
    expect(kinds(decide([hit("link_raid", true, "scam")], null, ctx({ standing: "new" }))?.actions)).toEqual(["delete", "ban"]);
    expect(kinds(decide([hit("link_raid", true, "scam")], null, ctx())?.actions)).toEqual(["delete"]);
    expect(decide([hit("lookalike", true, "scam")], null, ctx({ standing: "new" }))).toMatchObject({ offence: "certain", notice: "banned", alert: "action" });
    // Without a certain rule nobody is banned.
    expect(bans(decide([hit("phishing", false, "scam")], null, ctx({ standing: "new" }))?.actions)).toBe(false);
  });

  it("never bans an impersonator: deleted, muted a week, admins decide", () => {
    const d = decide([hit("impersonation")], null, ctx({ standing: "new", offences: record(9, 5) }));
    expect(kinds(d?.actions)).toEqual(["delete", `mute ${7 * DAY}`]);
    expect(d).toMatchObject({ alert: "action", offence: "model" });
  });

  it("never punishes a scam report: removed only when it carries the link, with the warning", () => {
    // As mod/rules-hits.ts marks them: "notice" when it carries the link or handle, "report" when it doesn't.
    const carrying = decide([hit("scam_report", true, "notice")], null, ctx({ standing: "new" }));
    expect(carrying).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", notice: "scam_report", alert: "scam_report" });
    const asking = decide([hit("scam_report", true, "report")], null, ctx());
    expect(asking).toMatchObject({ actions: [], offence: "none", notice: "scam_report" });
    expect(decide([hit("scam_report", true, "notice")], verdict("scam"), ctx({ standing: "new" }))).toBeNull();
  });

  it("removes a flaw report with the Security note, alerting without punishing", () => {
    expect(decide([hit("security_report", true, "alert")], null, ctx())).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", notice: "flaw", alert: "security" });
  });

  it("notes a newcomer's first link, then counts offences", () => {
    expect(decide([hit("newcomer_link")], null, ctx({ standing: "new" }))).toMatchObject({ actions: [{ kind: "delete" }], notice: "newcomer", offence: "model" });
    expect(kinds(decide([hit("newcomer_link")], null, ctx({ standing: "new", offences: record(1) }))?.actions)).toEqual(["delete", "mute 3600"]);
    expect(decide([hit("invite_link", true)], null, ctx({ standing: "new" }))).toMatchObject({ notice: "newcomer", offence: "certain" });
    expect(kinds(decide([hit("invite_link", true)], null, ctx())?.actions)).toEqual(["delete", "warn"]);
    expect(decide([hit("invite_link", true)], null, ctx({ standing: "trusted" }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none" });
  });

  it("handles a member's unknown link by strictness", () => {
    const link = [hit("unknown_link", false, "notice")];
    expect(decide(link, null, ctx({ strictness: "relaxed" }))).toBeNull();
    expect(decide(link, null, ctx({ strictness: "relaxed", raid: true }))).toMatchObject({ actions: [{ kind: "delete" }], alert: "action" });
    expect(decide(link, null, ctx())).toMatchObject({ actions: [{ kind: "delete" }], notice: "removed", offence: "none", alert: "action" });
    expect(decide(link, null, ctx({ strictness: "strict" }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "model", alert: "action" });
    expect(kinds(decide(link, null, ctx({ strictness: "strict", offences: record(1) }))?.actions)).toEqual(["delete", `mute ${DAY}`]);
  });

  it("deletes a flood's burst with at least a 10-minute mute and an offence", () => {
    expect(decide([hit("flood")], null, ctx())).toMatchObject({ actions: [{ kind: "delete" }, mute(600)], offence: "model", notice: "muted" });
    expect(kinds(decide([hit("flood")], null, ctx({ offences: record(2) }))?.actions)).toEqual(["delete", `mute ${DAY}`]);
  });

  it("bans a new member's certain fake support; a member gets an offence; both get the DM warning", () => {
    expect(decide([hit("fake_support", true, "scam")], null, ctx({ standing: "new" }))).toMatchObject({ actions: [{ kind: "delete" }, { kind: "ban" }], notice: "dm_warning" });
    expect(decide([hit("fake_support", true, "scam")], null, ctx())).toMatchObject({ actions: [{ kind: "delete" }, { kind: "warn" }], notice: "dm_warning", offence: "certain" });
  });

  it("removes names with links, bans bots added by members, and deletes abuse, contacts and risky files", () => {
    expect(kinds(decide([hit("name_link", true)], null, ctx())?.actions)).toEqual(["delete", "kick"]);
    expect(kinds(decide([hit("bot_added", true, "scam")], null, ctx())?.actions)).toEqual(["ban"]);
    expect(decide([hit("abuse", false, "alert")], null, ctx())).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", alert: "action" });
    expect(decide([hit("contact_info", false, "notice")], null, ctx())).toMatchObject({ actions: [{ kind: "delete" }], notice: "contact", offence: "none" });
    expect(kinds(decide([hit("risky_file")], null, ctx())?.actions)).toEqual(["delete", "warn"]);
  });

  it("lets a rule-certain offence take the ladder to a ban, and stops others at 24 hours", () => {
    expect(bans(decide([hit("invite_link", true)], null, ctx({ offences: record(3, 0) }))?.actions)).toBe(true);
    expect(kinds(decide([hit("risky_file")], null, ctx({ offences: record(3, 0) }))?.actions)).toEqual(["delete", `mute ${DAY}`]);
    expect(bans(decide([hit("risky_file")], null, ctx({ offences: record(3, 1) }))?.actions)).toBe(true);
  });

  it("moderates someone posting as a channel by its ID: delete, and ban the identity for a scam", () => {
    expect(decide([hit("lookalike", true, "scam")], null, ctx({ senderChat: true }))).toMatchObject({ actions: [{ kind: "delete" }, { kind: "ban_sender_chat" }], offence: "none" });
    expect(decide([hit("flood")], null, ctx({ senderChat: true }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none" });
  });

  it("sums punishment notices in raid mode but keeps the protective ones", () => {
    expect(decide([hit("lookalike", true, "scam")], null, ctx({ raid: true }))?.notice).toBeNull();
    expect(decide([hit("secret", true, "protect")], null, ctx({ raid: true }))?.notice).toBe("secret");
    expect(decide([hit("scam_report", true, "notice")], null, ctx({ raid: true }))?.notice).toBe("scam_report");
  });
});

describe("decide: observe and stale messages", () => {
  const observe = ctx({ strictness: "observe", standing: "new" });

  it("observe deletes secrets, look-alike and drainer links, and only reports the rest", () => {
    expect(decide([hit("lookalike", true, "scam")], null, observe)).toMatchObject({ actions: [{ kind: "delete" }], observeOnly: true, alert: "observe", offence: "none" });
    expect(decide([hit("phishing", true, "scam")], null, observe)?.actions).toEqual([{ kind: "delete" }]);
    expect(decide([hit("secret", true, "protect")], null, observe)).toMatchObject({ actions: [{ kind: "delete" }], notice: "secret" });
    const others: RuleCategory[] = ["invite_link", "flood", "fake_support", "impersonation", "name_link", "newcomer_link", "unknown_link", "risky_file", "abuse", "contact_info", "link_raid"];
    for (const category of others) {
      const d = decide([hit(category, true)], null, observe);
      expect(d, category).toMatchObject({ actions: [], observeOnly: true, notice: null, offence: "none" });
      expect(d?.alert, category).toBe("observe");
    }
    expect(decide([hit("security_report", true, "alert")], null, observe)).toMatchObject({ actions: [], alert: "security" });
    expect(decide([], verdict("scam"), observe)).toMatchObject({ actions: [], alert: "observe", aiGuess: "Asks people to connect a wallet." });
  });

  it("stale messages get deletes for certain hits only: no bans, mutes, notices, alerts or AI", () => {
    const stale = ctx({ stale: true, standing: "new" });
    expect(decide([hit("lookalike", true, "scam")], null, stale)).toMatchObject({ actions: [{ kind: "delete" }], notice: null, alert: null, offence: "none" });
    expect(decide([hit("flood")], null, stale)).toBeNull();
    expect(decide([hit("lookalike", true, "scam")], verdict("scam"), stale)).toBeNull();
    expect(decide([hit("invite_link", true)], null, { ...stale, strictness: "observe" })).toBeNull();
  });
});

describe("decide: Haiku's verdict", () => {
  it("never bans: a scam is a delete and a 24-hour mute, even for a new member with certain offences", () => {
    const d = decide([], verdict("scam"), ctx({ standing: "new", offences: record(6, 4) }));
    expect(d).toMatchObject({ actions: [{ kind: "delete" }, mute(DAY)], category: "model_scam", source: "model", offence: "model", aiGuess: "Asks people to connect a wallet." });
    for (let n = 0; n < 10; n += 1) expect(bans(decide([], verdict("spam"), ctx({ offences: record(n, 0) }))?.actions)).toBe(false);
  });

  it("stops model-only offences at a 24-hour mute", () => {
    expect(decide([], verdict("spam"), ctx({ offences: record(3, 0) }))?.actions).toEqual([{ kind: "delete" }, mute(DAY)]);
  });

  it("adds only what the rules haven't done: no second delete, no second offence", () => {
    const link = [hit("unknown_link", false, "notice")];
    expect(decide(link, verdict("spam"), ctx())).toMatchObject({ actions: [{ kind: "warn" }], offence: "model", alert: "action" });
    expect(decide(link, verdict("scam"), ctx())).toMatchObject({ actions: [mute(DAY)], offence: "model", notice: "muted" });
    expect(decide(link, verdict("ok"), ctx())).toBeNull();
    expect(decide([hit("risky_file")], verdict("spam"), ctx())).toBeNull();
    expect(decide(link, verdict("scam"), ctx({ strictness: "strict" }))).toMatchObject({ actions: [mute(DAY)], offence: "none" });
    expect(decide(link, verdict("spam"), ctx({ strictness: "relaxed" }))?.actions).toEqual([{ kind: "delete" }, { kind: "warn" }]);
  });

  it("keeps and alerts when unsure, deleting only in strict mode", () => {
    expect(decide([], verdict("unsure"), ctx())).toMatchObject({ actions: [], alert: "unsure", offence: "none" });
    expect(decide([], verdict("unsure"), ctx({ strictness: "strict" }))).toMatchObject({ actions: [{ kind: "delete" }], alert: "unsure" });
  });

  it("only deletes and alerts for a trusted member", () => {
    expect(decide([], verdict("scam"), ctx({ standing: "trusted" }))).toMatchObject({ actions: [{ kind: "delete" }], offence: "none", alert: "action" });
  });
});
