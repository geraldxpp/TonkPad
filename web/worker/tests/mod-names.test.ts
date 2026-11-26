// @vitest-environment node
import { domainToASCII } from "node:url";
import { describe, expect, it } from "vitest";
import { claimsBrand } from "../src/telegram/channel";
import { brandLookalike, fold, hasRoleWord, nameHash, nameRisk } from "../src/telegram/mod/names";

const ADMINS = [
  { name: "Alex Admin", username: "alex_admin" },
  { name: "Alex", username: "alex_tonkfun" },
  { name: "Mia", username: null },
];
const BOT = ["TonkfunBot"];
const risk = (name: string, username: string | null = null, tag: string | null = null) => nameRisk({ name, username, tag, admins: ADMINS, bot: BOT });

describe("fold", () => {
  it("reads look-alike letters, fancy fonts and digits as plain letters", () => {
    for (const name of ["TONK", "ΤΟΝΚ", "Тонк", "T0NK", "𝐓𝐨𝐧𝐤", "ｔｏｎｋ", "T̲O̲N̲K̲", "7ONK"]) expect(fold(name)).toBe("tonk");
    expect(fold("Tonkfun | Admin")).toBe("tonkfun admin");
    expect(fold("Mоdеrаtоr")).toBe("moderator");
    expect(fold("Support​Team")).toBe("supportteam");
    expect(fold("rnetamask")).toBe("metamask");
  });

  it("agrees with the channel's brand rule on the channel's own look-alikes", () => {
    for (const name of ["ΤΟΝΚ", "Тонк", "T0NK", "tonkfun", "STONKS", "Tonkatsu"]) {
      expect(fold(name).split(" ").some((w) => w.startsWith("tonk") && !["tonkatsu"].includes(w))).toBe(claimsBrand(name, ""));
    }
  });
});

describe("nameHash", () => {
  it("is 16 hex, the same for a name and its look-alike, different for another name", () => {
    expect(nameHash("Sam Doe")).toMatch(/^[0-9a-f]{16}$/);
    expect(nameHash("Sаm Doe")).toBe(nameHash("Sam Doe")); // Cyrillic а
    expect(nameHash("Tom Doe")).not.toBe(nameHash("Sam Doe"));
  });
});

describe("nameRisk", () => {
  it("catches an admin's twin with a Cyrillic letter and a similar username", () => {
    expect(risk("Аlex Admin", "alex_admln")).toBe("impersonation");
    expect(risk("Alex  Admin", "alexadmin")).toBe("impersonation");
  });

  it("leaves a member who only shares an admin's first name", () => {
    expect(risk("Alex", "alexander1990")).toBeNull();
    expect(risk("Alex", null)).toBeNull();
  });

  it("catches a twin of an admin without a username only when neither has one", () => {
    expect(risk("Mia", null)).toBe("impersonation");
    expect(risk("Mia", "mia_trades")).toBeNull();
  });

  it.each([
    ["Tonkfun Support"],
    ["TonkFun | Admin"],
    ["TonkfunSupport"],
    ["T0nkfun Team"],
    ["7onkfun Support"],
    ["Soporte Tonkfun"],
    ["Поддержка Tonkfun"],
    ["Tonkfun 客服"],
  ])("catches the brand beside a role word: %s", (name) => {
    expect(risk(name)).toBe("impersonation");
  });

  it.each([["Support Team"], ["Help Desk"], ["Customer care"], ["Admin"], ["官方客服"], ["Служба поддержки"]])("catches a name of role words only: %s", (name) => {
    expect(risk(name)).toBe("impersonation");
  });

  it("checks the member tag like a name", () => {
    expect(risk("Sam", "sam_doe", "Admin")).toBe("impersonation");
    expect(risk("Sam", "sam_doe", "Whale")).toBeNull();
  });

  it("catches a name that reads like the bot", () => {
    expect(risk("TonkfunBot")).toBe("impersonation");
    expect(risk("Tonkfun Bot")).toBe("impersonation");
    expect(risk("TonkFun")).toBe("impersonation");
  });

  it("finds a link or handle in the name or tag first", () => {
    expect(risk("Free crypto t.me/xyz")).toBe("link");
    expect(risk("Sam @pumpsignals")).toBe("link");
    expect(risk("Sam", null, "claim-now.xyz")).toBe("link");
    expect(risk("Tonkfun Support t.me/fake")).toBe("link");
  });

  it.each([["Stonks Dev"], ["Dev"], ["Sam"], ["Tonka Truck Fan"], ["María José"], ["Иван"], ["小明"], ["Pepe the Frog 🐸"]])("leaves an ordinary name alone: %s", (name) => {
    expect(risk(name)).toBeNull();
  });

  it("knows role words in a title", () => {
    expect(hasRoleWord("Crypto Support Hub")).toBe(true);
    expect(hasRoleWord("Daily Crypto News")).toBe(false);
  });
});

describe("brandLookalike", () => {
  it.each([
    "tonk-fun.xyz",
    "tonkfun.fun.claim.xyz",
    "tonkfum.app",
    "t0nkfun.io",
    "tonkpad.fun",
    "claimtonkfun.site",
    "tonk.fun",
    domainToASCII("tоnkfun.com"),
    "metamask-sync.io",
    "metаmask.io",
    "phantom-claim.xyz",
    "robinhood-chain-bridge.app",
    "uniswap.exchange",
    "pump-fun.io",
    "dexscreener.vip",
    "solscan-airdrop.com",
  ])("%s poses as a brand", (domain) => {
    expect(brandLookalike(domain)).toBe(true);
  });

  it.each([
    "tonkfun.fun",
    "www.tonkfun.fun",
    "docs.tonkfun.fun",
    "tonk-pad.vercel.app",
    "robinhoodchain.blockscout.com",
    "rpc.mainnet.chain.robinhood.com",
    "app.uniswap.org",
    "metamask.io",
    "support.metamask.io",
    "pump.fun",
    "phantom.app",
    "solscan.io",
    "stonks.lol",
    "tonka.com",
    "tonkatsu.jp",
    "tonkin.org",
    "solana.com",
    "example.com",
  ])("%s doesn't", (domain) => {
    expect(brandLookalike(domain)).toBe(false);
  });
});
