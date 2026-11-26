// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dmRequestOf } from "../src/telegram/mod/rules-scan";
import type { TgMessageEntity } from "../src/telegram/types";
import { cats, check, hit, punishes } from "./mod-rules-fixtures";

const BOTH = ["new", "member"] as const;
const email = (text: string, part: string): TgMessageEntity => ({ type: "email", offset: text.indexOf(part), length: part.length });

/** rules#2: a member asking the team, or anyone, to message them is asking for help, never offering it. */
describe("a help request that asks to be messaged is no fake support (rules#2)", () => {
  it.each([
    "I got scammed by tonkfun-claim.xyz, please DM me admins, my funds are gone",
    "I got scammed by tonkfun-claim.xyz, scam! please DM me admins, my funds are gone",
  ])("a scam victim's report stays a report: %s", (text) => {
    for (const standing of BOTH) {
      expect(cats(text, { standing }), `${standing}: ${text}`).toEqual(["scam_report"]);
      expect(punishes(text, { standing })).toBe(false);
    }
  });

  it.each([
    "My wallet got drained by a fake support account, scam! Can an admin DM me?",
    "Mods: please contact me if my launch is stuck",
    "Mods, please contact me if my launch is stuck",
    "Admin, please DM me, I need help",
    "admins, DM me",
    "can an admin DM me?",
    "please DM me admins",
    "mods: contact me",
    "my launch is stuck, can someone DM me",
    "can someone DM me for help?",
    "pls dm me for help with my stuck tx",
    "Need help! Can someone contact me?",
    "管理员请私信我，我的钱包被盗了",
    "Админ, напишите мне, пожалуйста, у меня проблема",
  ])("kept, unpunished, with the DM-safety warning: %s", (text) => {
    for (const standing of BOTH) {
      const result = check(text, { standing });
      expect(result.hits.filter((h) => h.category === "fake_support"), `${standing}: ${text}`).toEqual([]);
      expect(punishes(text, { standing })).toBe(false);
      expect(dmRequestOf(result.markers)).toBe(true);
    }
  });

  it("an offer is still an offer", () => {
    for (const text of ["DM me for support", "Admin here, DM me for support", "Tonkfun team: DM me for support"]) {
      expect(hit(text, "fake_support", { standing: "new" }), text).toBeDefined();
      expect(dmRequestOf(check(text).markers)).toBe(false);
    }
  });
});

/** rules#7: fake support that offers bait is certain, and only a real request, report or quote lifts it. */
describe("rule-certain fake support (rules#7)", () => {
  it.each([
    "DM me to claim your airdrop",
    "请私信我领取空投",
    "DM me for the presale whitelist",
    "DM me for support, my team will fix it",
    "Contact @CryptoFixer for help, he fixed my wallet",
    "Team says: DM me for support",
    '"DM me for support"',
    "Schreib mir nicht in der Gruppe sondern privat, ich helfe dir",
  ])("certain from a new member: %s", (text) => {
    expect(hit(text, "fake_support", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });

  it("someone else's quoted words, with report words, are a report", () => {
    expect(cats('a guy wrote "DM me for support", is this a scam?', { standing: "new" })).toEqual(["scam_report"]);
  });

  it("a look-alike e-mail domain is a look-alike, and asking members to write to an address for help is fake support", () => {
    const text = "contact support@tonkfun-help.io for help with stuck tx";
    expect(hit(text, "lookalike", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
    expect(cats(text, { standing: "new", entities: [email(text, "support@tonkfun-help.io")] })).toEqual(["contact_info", "fake_support", "lookalike"]);
    const plain = "contact sam@cryptofixer.io for help";
    expect(hit(plain, "fake_support", { standing: "new" })).toMatchObject({ certain: false });
    expect(cats(plain, { standing: "trusted" })).toEqual([]);
  });

  it("the Security contact stays official, and a question about a look-alike address is a report", () => {
    const security = "For bugs, contact security@tonkfun.fun with the details";
    expect(cats(security, { standing: "new" })).toEqual([]);
    expect(cats("is support@tonkfun-help.io real?", { standing: "new" })).toEqual(["scam_report"]);
  });
});

/** A victim describing someone else's "email X for support" is reporting a scam, never offering support themself. */
describe("an address someone else offered for support, in a report, is no fake support", () => {
  it.each([
    "@TonkfunBot someone told me to email help@gmail.com for support, is that a scam?",
    "@TonkfunBot is it a scam? they said contact help@gmail.com for support",
    "beware, fake support asks you to email help@gmail.com for support",
  ])("%s", (text) => {
    for (const standing of BOTH) {
      expect(cats(text, { standing }), `${standing}: ${text}`).not.toContain("fake_support");
      expect(punishes(text, { standing })).toBe(false);
    }
  });

  it("still reads the author's own offer to write to an address for help as fake support", () => {
    expect(cats("email help@gmail.com for support", { standing: "new" })).toContain("fake_support");
  });
});

