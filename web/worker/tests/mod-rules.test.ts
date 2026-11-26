// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Standing, Strictness } from "../src/telegram/community/types";
import type { TgMessageEntity } from "../src/telegram/types";
import { cats, check, EN_12, hit, punishes, WHOA } from "./mod-rules-fixtures";

const NOT_ADMIN: Standing[] = ["member", "new", "trusted"];

describe("secrets", () => {
  it.each(NOT_ADMIN)("a recovery phrase from a %s is removed, never as an offence", (standing) => {
    expect(check(`my words: ${EN_12}`, { standing }).hits).toEqual([{ category: "secret", severity: "protect", certain: true, detail: expect.any(String) }]);
    expect(cats(EN_12.replace(/yellow$/, "yelow"), { standing })).toEqual(["secret_probable"]);
  });
});

describe("look-alike and drainer links", () => {
  it.each(NOT_ADMIN)("a look-alike link from a %s is a certain scam", (standing) => {
    expect(hit("airdrop live at tonkfun-claim.xyz", "lookalike", { standing })).toMatchObject({ severity: "scam", certain: true });
    expect(hit("go to tonkfun[.]xyz", "lookalike", { standing })).toMatchObject({ severity: "scam", certain: true });
  });

  it.each([
    ["English", "Claim your airdrop now: bonus-drop.site"],
    ["a drainer username", "free tokens from @AirdropClaimBot"],
    ["a drainer Telegram link", "t.me/claim_rewards_bot"],
    ["Spanish", "Conecta tu billetera en wallet-fix.site para recibir"],
    ["Russian", "Подключите кошелек на wallet-fix.site"],
    ["Chinese", "请连接钱包 wallet-fix.site 领取空投"],
  ])("drainer bait: %s", (_, text) => {
    expect(hit(text, "phishing")).toMatchObject({ severity: "scam", certain: true });
  });
});

describe("reporting a scam is never punished", () => {
  it.each([
    ["@TonkfunSupportDesk DMed me to validate my wallet, is that you?", "notice"],
    ["don't click tonkfun-airdrop.xyz, it's a drainer", "notice"],
    ["is t.me/+AbC the real group?", "notice"],
    // The quoted solicitation is removed with the report, so it doesn't spread (abuse#5).
    ["a guy wrote 'DM me for support', is this a scam?", "notice"],
    ["is this phishing? they want my wallet", "none"],
    ["¿Es real tonkfun-airdrop.xyz? Me escribió por privado", "notice"],
    ["мне написал @TonkfunSupportDesk, это правда вы?", "notice"],
    ["这个 t.me/+AbC 是真的吗？", "notice"],
  ])("%s", (text, severity) => {
    for (const standing of ["member", "new"] as const) {
      const expected = severity === "none" ? [] : [{ category: "scam_report", severity, certain: expect.any(Boolean), detail: expect.any(String) }];
      expect(check(text, { standing }).hits).toEqual(expected);
      expect(punishes(text, { standing })).toBe(false);
    }
  });

  it("a spam opener such as WARNING or ATTENTION is no report", () => {
    expect(punishes("ATTENTION!! Airdrop live, claim at bonus-drop.site", { standing: "new" })).toBe(true);
    expect(punishes("WARNING: last chance to claim your airdrop at bonus-drop.site", { standing: "new" })).toBe(true);
  });
});

describe("DM me and fake support", () => {
  it("is a certain scam from a new member, an offence from a member, and fine from the trusted", () => {
    expect(hit("DM me for help", "fake_support", { standing: "new" })).toMatchObject({ severity: "scam", certain: true });
    expect(hit("DM me for help", "fake_support")).toMatchObject({ severity: "offence", certain: true });
    expect(cats("DM me for help", { standing: "trusted" })).toEqual([]);
  });

  it.each([["Spanish", "escríbeme por privado y te ayudo"], ["Russian", "напишите мне в лс, помогу"], ["a contact handle", "contact our team: @TonkfunHelpDesk"]])(
    "solicitation in %s",
    (_, text) => {
      expect(hit(text, "fake_support")).toMatchObject({ certain: true });
    },
  );

  it("a solicitation with no support word or bait beside it is fake support, but not certain (abuse#4, rules#7)", () => {
    expect(hit("请私信我", "fake_support", { standing: "new" })).toMatchObject({ certain: false });
    expect(hit("请私信我领取空投", "fake_support", { standing: "new" })).toMatchObject({ certain: true });
  });

  it("pointing someone to an admin or the bot, or asking to be pinged, isn't solicitation", () => {
    for (const text of ["talk to @alex_admin about refunds", "contact @TonkfunBot for help", "dm @alex_admin if it fails", "ping me when it launches", "write me a summary"]) {
      expect(cats(text, { standing: "new" })).toEqual([]);
    }
    expect(hit("contact @CryptoFixer for help", "fake_support", { standing: "new" })).toMatchObject({ certain: true });
  });

  it("a support handle that isn't official is fake support, but not certain", () => {
    expect(hit("@TonkfunHelpDesk sorts refunds", "fake_support")).toMatchObject({ certain: false });
    expect(cats("@TonkfunBot what's the fee")).toEqual([]);
    expect(cats("ask @alex_admin about it")).toEqual([]);
  });
});

describe("invite links", () => {
  it.each([
    ["member", "offence"],
    ["new", "notice"],
    ["trusted", "notice"],
  ] as const)("from a %s: %s", (standing, severity) => {
    expect(check("join t.me/+AbCdEf", { standing }).hits).toEqual([{ category: "invite_link", severity, certain: true, detail: expect.any(String) }]);
  });
});

describe("names", () => {
  it("a name posing as the team is muted, never certain; a link in the name is certain", () => {
    expect(hit("gm", "impersonation", { sender: { name: "Tonkfun Support", username: null, tag: null } })).toMatchObject({ severity: "scam", certain: false });
    expect(hit("gm", "name_link", { sender: { name: "Sam t.me/pumps", username: null, tag: null } })).toMatchObject({ certain: true });
    expect(hit("gm", "impersonation", { sender: { name: "Sam", username: "sam_doe", tag: "Admin" }, tagsByAdmins: false })).toBeDefined();
  });

  it("a trusted member's trusted name is skipped", () => {
    expect(cats("gm", { standing: "trusted", trustedName: true, sender: { name: "Tonkfun Support", username: null, tag: null } })).toEqual([]);
  });
});

describe("new members", () => {
  it.each([
    ["an unknown link", "check pumpsignals.site", {}],
    ["a Telegram link", "t.me/pumpsignals", {}],
    ["a forward", "gm", { forwarded: true, forwardName: "Some Channel" }],
    ["another bot's link buttons", "gm", { viaButtons: true }],
    ["a reply to another chat", "gm", { externalOtherChat: true }],
  ])("%s", (_, text, extra) => {
    expect(check(text, { standing: "new", ...extra }).hits).toEqual([{ category: "newcomer_link", severity: "notice", certain: false, detail: expect.any(String) }]);
  });

  it("may share allowed and official links", () => {
    expect(cats("read https://www.tonkfun.fun/docs and t.me/tonkfun_launches", { standing: "new" })).toEqual([]);
  });
});

describe("members' unknown links and brand forwards, by strictness", () => {
  it.each([
    ["observe", false, "notice"],
    ["relaxed", false, "alert"],
    ["relaxed", true, "notice"],
    ["normal", false, "notice"],
    ["strict", false, "notice"],
  ] as const)("%s (raid %s): %s", (strictness: Strictness, raid, severity) => {
    expect(hit("look at pumpsignals.site", "unknown_link", { strictness, raid })).toMatchObject({ severity, certain: false });
    expect(hit("gm", "brand_forward", { strictness, raid, forwarded: true, forwardName: "Tonkfun Official" })).toMatchObject({ severity });
  });

  it("a hidden-dot spelling of an ordinary site is an unknown link", () => {
    expect(cats("visit pumpsignals(.)site")).toEqual(["unknown_link"]);
  });

  it("forwards from the official channel, the bot or an admin, or from an ordinary name, are fine", () => {
    expect(cats("gm", { forwarded: true, forwardName: "Tonkfun Launches", forwardUsername: "tonkfun_launches" })).toEqual([]);
    expect(cats("gm", { forwarded: true, forwardName: "Daily News" })).toEqual([]);
    expect(cats("gm", { forwarded: true, forwardName: "Crypto Support Hub" })).toEqual(["brand_forward"]);
  });

  it("trusted members skip both", () => {
    expect(cats("look at pumpsignals.site", { standing: "trusted" })).toEqual([]);
    expect(cats("gm", { standing: "trusted", forwarded: true, forwardName: "Tonkfun Official" })).toEqual([]);
  });
});

describe("contact details, files, flaw reports and abuse", () => {
  const contacts: TgMessageEntity[] = [{ type: "phone_number", offset: 5, length: 12 }];
  it("a phone number or e-mail is removed with a note, except from the trusted", () => {
    expect(hit("call +15551234567", "contact_info", { entities: contacts })).toMatchObject({ severity: "notice" });
    expect(hit("mail sam@mail.com", "contact_info", { standing: "new", entities: [{ type: "email", offset: 5, length: 12 }] })).toBeDefined();
    expect(cats("call +15551234567", { standing: "trusted", entities: contacts })).toEqual([]);
  });

  it("an executable or archive is an offence, except from the trusted", () => {
    expect(hit("", "risky_file", { riskyFile: true })).toMatchObject({ severity: "offence" });
    expect(cats("", { standing: "trusted", riskyFile: true })).toEqual([]);
  });

  it.each([
    ["English", `I found a reentrancy vulnerability in ${WHOA}`],
    ["Spanish", `encontré una vulnerabilidad en el contrato ${WHOA}`],
    ["Russian", `нашел уязвимость в контракте ${WHOA}`],
    ["Chinese", `发现合约漏洞 ${WHOA}`],
  ])("a flaw report with an address (%s)", (_, text) => {
    expect(hit(text, "security_report")).toMatchObject({ severity: "notice", certain: true });
  });

  it("a flaw report needs 200 characters, code or an address", () => {
    const short = "is there a bug bounty?";
    expect(cats(short)).toEqual([]);
    expect(cats(`${short} ${"The curve rounds down twice when selling. ".repeat(5)}`)).toEqual(["security_report"]);
    expect(cats("exploit: sell(1)", { entities: [{ type: "code", offset: 9, length: 7 }] })).toEqual(["security_report"]);
  });

  it.each([["English", "I will kill you"], ["Spanish", "te voy a matar"], ["Russian", "я тебя убью"]])("a threat (%s) is deleted for the admins to decide", (_, text) => {
    expect(hit(text, "abuse")).toMatchObject({ severity: "alert", certain: false });
  });
});
