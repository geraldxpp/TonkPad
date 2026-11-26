// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cats, check, hit, punishes } from "./mod-rules-fixtures";

const BOTH = ["new", "member"] as const;
/** How members open a question to the bot or the group (rules#1): nothing, a mention, a command, a vocative. */
const OPENERS = ["", "@TonkfunBot ", "/ask ", "hey, "];

/** rules#1: asking whether a risky link is real is a report wherever it stands, the bot included. */
describe("a legitimacy question about a risky link is a report, never a scam (rules#1)", () => {
  const QUESTIONS = [
    "is tonkfun-airdrop.xyz real? got it in a DM",
    "is tonkfun-airdrop.xyz real?",
    "anyone know if tonkfun-airdrop.xyz is real?",
    "is this the official site? tonkfun-airdrop.xyz",
    "can I trust tonkfun-airdrop.xyz?",
    "is tonkfun-airdrop.xyz yours?",
    "tonkfun-airdrop.xyz official?",
    "tonkfun-airdrop.xyz real or not?",
    "tonkfun-airdrop.xyz это официальный сайт?",
    "tonkfun-airdrop.xyz 是官网吗？",
    "tonkfun-airdrop.xyz là trang chính thức à?",
    "apakah tonkfun-airdrop.xyz resmi?",
    "tonkfun-airdrop.xyz c'est le site officiel ?",
    "tonkfun-airdrop.xyz 공식 사이트인가요?",
    "is t.me/+AbC the real group?",
  ];
  const cases = QUESTIONS.flatMap((q) => OPENERS.map((o) => `${o}${q}`));

  it.each(cases)("must not punish: %s", (text) => {
    for (const standing of BOTH) {
      expect(check(text, { standing }).hits, `${standing}: ${text}`).toEqual([{ category: "scam_report", severity: "notice", certain: true, detail: expect.any(String) }]);
      expect(punishes(text, { standing })).toBe(false);
    }
  });

  it("counts toward the report marker, so the message is never a raider", () => {
    expect(check("@TonkfunBot is tonkfun-airdrop.xyz real?").markers.reportWords).toBe(true);
  });

  it.each([
    ["a question about something else beside the link", "Is your wallet safe? Validate it now at tonkfun-claim.xyz", "lookalike"],
    ["no legitimacy word", "what is tonkfun-claim.xyz?", "lookalike"],
    ["a statement, not a question", "tonkfun-claim.xyz is the official site", "lookalike"],
  ] as const)("is no waiver: %s", (_, text, category) => {
    expect(hit(text, category, { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
  });
});

/** rules#5: report words waive only a report aimed at the link, never one carrying bait, a claim or an endorsement. */
describe("report words never waive bait, a claim or an endorsement (rules#5)", () => {
  it.each([
    "100% legit, claim your TONK airdrop at tonkfun-airdrop.xyz/claim",
    "⚠️ Beware of fake admins! The ONLY official claim page is tonkfun-claim.xyz",
    "No scam, connect your wallet at portal-hub.site",
    "Is tonkfun-claim.xyz the official page? Yes! Claim now",
    "Infos per PN, claim hier: rewards-portal.xyz/claim",
    "estafa no, reclama tu airdrop en tonkfun-claim.xyz",
    "не фейк, получи свой аирдроп на tonkfun-claim.xyz",
    "不是骗局，领取空投 tonkfun-claim.xyz",
    "Beware of fake sites, use only tonkfun-claim.xyz",
    "Never connect your wallet to random sites, the only official one is tonkfun-claim.xyz",
    "Watch out for scams! Connect your wallet only at tonkfun-claim.xyz",
    "Official airdrop: tonkfun-claim.xyz. Beware of fakes!",
  ])("must punish: %s", (text) => {
    expect(cats(text, { standing: "new" })).not.toContain("scam_report");
    expect(punishes(text, { standing: "new" })).toBe(true);
    expect(check(text, { standing: "new" }).hits.some((h) => h.certain && (h.category === "lookalike" || h.category === "phishing"))).toBe(true);
  });

  it("bare 'legit' and bare 'per PN' are no report words; 'hat mir per PN geschrieben' still is", () => {
    expect(check("100% legit project").markers.reportWords).toBe(false);
    expect(check("Infos per PN").markers.reportWords).toBe(false);
    expect(check("Jemand hat mir per PN geschrieben und wollte meine Seed").markers.reportWords).toBe(true);
  });

  it.each([
    "careful, tonkfun-airdrop.xyz/claim is a scam, don't click",
    "Beware: tonkfun-claim.xyz asks you to connect your wallet, don't click it",
    "Scam alert: tonkfun-claim.xyz says claim your airdrop, it's fake",
    "don't connect your wallet to tonkfun-claim.xyz, it's a drainer",
    "The real site is tonkfun.fun, tonkfun-claim.xyz is fake",
    "tonkfun-claim.xyz messaged me, is that you?",
    "这个是骗局，别领取空投 tonkfun-claim.xyz",
    "I tried to claim on tonkfun-claim.xyz and got drained, it's a scam!",
    "tonkfun-claim.xyz is a fake claim site, don't click",
    "Scam alert! tonkfun-claim.xyz is fake. Claim the real airdrop at tonkfun.fun/claim",
    "tonkfun-claim.xyz isn't official!",
    "don't join t.me/+AbCdEf, it's a scam group",
    "tonkfun-claim.xyz — это скам, не переходите",
    "tonkfun-claim.xyz là lừa đảo, đừng bấm",
  ])("must not punish a warning aimed at the link: %s", (text) => {
    for (const standing of BOTH) {
      expect(cats(text, { standing }), `${standing}: ${text}`).toEqual(["scam_report"]);
      expect(punishes(text, { standing })).toBe(false);
    }
  });

  it("a report far from the link isn't aimed at it", () => {
    expect(cats("Beware of scams in DMs.\n\nAnyway, gm all.\n\nAirdrop time: tonkfun-claim.xyz", { standing: "new" })).not.toContain("scam_report");
  });
});
