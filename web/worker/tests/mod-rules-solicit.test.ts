// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TgMessageEntity } from "../src/telegram/types";
import { cats, check, hit, punishes } from "./mod-rules-fixtures";

const email = (text: string, part: string): TgMessageEntity => ({ type: "email", offset: text.indexOf(part), length: part.length });
const BOTH = ["new", "member"] as const;

describe("a negated 'DM me' asks nobody to message privately (abuse#4)", () => {
  it.each([
    "Please don't DM me, I'm fine",
    "never dm me",
    "the team said: never message us first",
    "do not dm me, I don't do private chats",
    "Bitte schreibt mir keine PN",
    "não me chame no pv",
    "не пишите мне в личку",
    "đừng nhắn tin cho tôi",
    "jangan hubungi saya",
    "别联系客服 @alice_tonk",
  ])("%s", (text) => {
    for (const standing of BOTH) expect(cats(text, { standing }).filter((c) => c === "fake_support")).toEqual([]);
  });
});

describe("German reports of a DM are reports, not solicitation (abuse#4)", () => {
  it.each(["Jemand hat mir per DM geschrieben und wollte meine Seed", "Mir hat jemand per PN geschrieben, angeblich vom Team"])("%s", (text) => {
    for (const standing of BOTH) expect(cats(text, { standing })).toEqual([]);
    expect(check(text).markers.reportWords).toBe(true);
  });

  it("asking for a PN is still solicitation", () => {
    expect(hit("Schreib mir per PN, ich helfe dir", "fake_support", { standing: "new" })).toMatchObject({ certain: true });
  });
});

describe("e-mail addresses (abuse#4)", () => {
  const SECURITY = "For bugs, contact security@tonkfun.fun with the details";

  it("the Security contact is official: no solicitation, and no one's private address", () => {
    for (const standing of BOTH) {
      expect(cats(SECURITY, { standing, entities: [email(SECURITY, "security@tonkfun.fun")] })).toEqual([]);
      expect(cats(SECURITY, { standing })).toEqual([]);
    }
  });

  it("an address is never read as a handle, but asking members to write to one for help is fake support, never certain (rules#7)", () => {
    const text = "contact sam@cryptofixer.io for help";
    expect(cats(text, { standing: "new" })).toEqual(["fake_support"]);
    expect(hit(text, "fake_support", { standing: "new" })).toMatchObject({ certain: false });
    expect(cats(text, { standing: "new", entities: [email(text, "sam@cryptofixer.io")] })).toEqual(["contact_info", "fake_support"]);
    expect(cats("my email is sam@cryptofixer.io if that helps the team", { standing: "new" })).toEqual([]);
  });
});

describe("fake support is rule-certain only as an offer of support (abuse#4)", () => {
  it.each([
    "DM me for support",
    "DM me for help",
    "contact @CryptoFixer for help",
    "message the admin @CryptoFixer",
    "contact our team: @TonkfunHelpDesk",
    "inbox me, I can help you recover it",
    "Having trouble with your wallet? DM me, I can fix it",
    "Need help? contact @CryptoFixer",
    "escríbeme por privado y te ayudo",
    "напишите мне в лс, помогу",
    "请联系客服 @kefu_tonk",
  ])("certain: %s", (text) => {
    expect(hit(text, "fake_support", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });

  // Help requests ("Mods: please contact me…") are no fake support at all (rules#2, mod-rules-requests.test.ts); bait makes one certain (rules#7).
  it.each(["DM me", "hit me up", "contact me", "请私信我"])("not certain, so never a ban: %s", (text) => {
    expect(hit(text, "fake_support", { standing: "new" })).toMatchObject({ certain: false });
  });
});

describe("only report words waive the scam rules, never a question alone (abuse#5)", () => {
  it.each([
    ["Why wait? claim your airdrop at portal-hub.site", "phishing"],
    ["Missed it? tonkfun-airdrop.xyz/claim?ref=5", "lookalike"],
    ["Want in? join t.me/+VipGroup123", "invite_link"],
    ["Need help? contact @CryptoFixer", "fake_support"],
  ] as const)("%s", (text, category) => {
    expect(cats(text, { standing: "new" })).toContain(category);
    expect(punishes(text, { standing: "member" })).toBe(true);
  });

  it("a legitimacy question is a report", () => {
    for (const text of ["is t.me/+AbC the real group?", "Is tonkfun-airdrop.xyz the official site", "are @TonkfunHelpDesk and t.me/+AbC real?", "tonkfun-airdrop.xyz legit?", "tonkfun-airdrop.xyz: real or fake?"]) {
      expect(cats(text, { standing: "new" }), text).toEqual(["scam_report"]);
    }
  });

  it.each([
    "Beware of scammers! DM me for official support",
    "This is not a scam, DM me for help",
    "Careful, fake admins everywhere. Contact @CryptoFixer for help",
  ])("the author's own solicitation is never waived by report words: %s", (text) => {
    expect(hit(text, "fake_support", { standing: "new" })).toMatchObject({ certain: true });
    expect(cats(text, { standing: "new" })).not.toContain("scam_report");
  });

  it("a trusted member may ask to be messaged, so their warning still waives the link", () => {
    const text = "Beware of scams: never open tonkfun-claim.xyz. DM me if you need help";
    expect(cats(text, { standing: "trusted" })).toEqual(["scam_report"]);
    expect(cats(text, { standing: "member" })).toEqual(["fake_support", "lookalike", "phishing"]);
  });

  it.each([
    "a guy wrote 'DM me for support', is this a scam?",
    "someone keeps telling me to contact @CryptoFixer, scam?",
    "Got a message: contact @TonkfunSupport for help. Is this legit?",
    "он написал «пишите мне в лс», это развод?",
  ])("a solicitation quoted or attributed in a report is deleted, never punished: %s", (text) => {
    for (const standing of BOTH) {
      expect(check(text, { standing }).hits).toEqual([{ category: "scam_report", severity: "notice", certain: false, detail: expect.any(String) }]);
    }
  });
});
