// @vitest-environment node
import { domainToASCII } from "node:url";
import { describe, expect, it } from "vitest";
import type { AllowList } from "../src/telegram/community/types";
import { findContacts, findHandles, findLinks, stripLinks } from "../src/telegram/mod/links";
import type { TgMessageEntity } from "../src/telegram/types";

const ALLOW: AllowList = {
  domains: ["tonkfun.fun", "tonk-pad.vercel.app", "robinhoodchain.blockscout.com", "solscan.io", "explorer.solana.com"],
  telegram: ["tonkfunbot", "tonkfun_launches", "tonkfun_chat"],
  x: ["tonkfun"],
};
const WHOA = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";

const links = (text: string, entities: TgMessageEntity[] = []) => findLinks(text, entities, ALLOW);
const kinds = (text: string, entities: TgMessageEntity[] = []) => links(text, entities).map((l) => l.kind);
/** A url entity over the first occurrence of `part`, as Telegram marks it. */
const urlEntity = (text: string, part: string): TgMessageEntity => ({ type: "url", offset: text.indexOf(part), length: part.length });

describe("invite links", () => {
  it.each([
    "join us t.me/+AbCdEf123",
    "https://t.me/+AbC",
    "t.me/joinchat/AbCdEf",
    "https://telegram.me/joinchat/XyZ",
    "https://telegram.dog/+abc",
    "t.me/addlist/tonkfolder",
    "tg://join?invite=AbC",
    "https://t.me/%2BAbC",
    "únete: t.me/+AbC ahora",
    "вступай: t.me/+AbC",
    "加入群组 t.me/+AbC",
  ])("%s is an invite", (text) => {
    expect(kinds(text)).toEqual(["telegram_invite"]);
  });

  it("keys an invite by its hash however it is written, and keeps the hash's case", () => {
    expect(links("t.me/joinchat/AbC")[0].key).toBe("t.me/+AbC");
    expect(links("tg://join?invite=AbC")[0].key).toBe("t.me/+AbC");
    expect(links("https://telegram.me/+AbC")[0].key).toBe("t.me/+AbC");
  });

  it("reads t.me/+<digits> as a chat by phone number, not an invite", () => {
    expect(kinds("t.me/+15551234567")).toEqual(["telegram"]);
  });

  it("finds an invite behind a text_link", () => {
    const text = "the real group";
    expect(kinds(text, [{ type: "text_link", offset: 4, length: 4, url: "https://t.me/+Secret" }])).toEqual(["telegram_invite"]);
  });
});

describe("Telegram links", () => {
  it("tells official usernames from others, and keys a username like a mention", () => {
    expect(links("news: t.me/tonkfun_launches/12")[0]).toEqual({ domain: "t.me", kind: "official_telegram", key: "@tonkfun_launches", raid: "t.me/tonkfun_launches/12" });
    expect(links("https://t.me/TonkfunBot?start=appeal")[0].kind).toBe("official_telegram");
    expect(links("t.me/ScamSupport")[0]).toEqual({ domain: "t.me", kind: "telegram", key: "@scamsupport", raid: "t.me/scamsupport" });
    expect(links("tg://resolve?domain=ScamSupport")[0].key).toBe("@scamsupport");
    expect(links("https://scamsupport.t.me")[0].key).toBe("@scamsupport");
  });
});

describe("look-alike domains", () => {
  const punycode = domainToASCII("tоnkfun.com"); // Cyrillic о
  it.each([
    ["a hyphen", "go to tonk-fun.xyz now"],
    ["an extra label", "https://tonkfun.fun.claim-rewards.xyz/start"],
    ["punycode", `http://${punycode}/claim`],
    ["a Cyrillic a", "https://metаmask.io/sync"],
    ["a digit o", "t0nkfun.app"],
    ["a MetaMask sync", "metamask-sync.io"],
    ["a Phantom claim", "phantom-claim.xyz"],
    ["a Robinhood bridge", "robinhood-chain-bridge.app"],
    ["a brand inside a word", "claimtonkfun.site"],
    ["Spanish", "Reclama en tonkfun-airdrop.xyz"],
    ["Russian", "Забирай на t0nkfun.app"],
  ])("%s", (_, text) => {
    expect(kinds(text)).toEqual(["lookalike"]);
  });

  it("finds a scam domain hiding behind a text_link's words", () => {
    expect(links("Read the Docs", [{ type: "text_link", offset: 9, length: 4, url: "https://tonkfun-claim.xyz/docs" }])).toEqual([
      { domain: "tonkfun-claim.xyz", kind: "lookalike", key: "tonkfun-claim.xyz", raid: "tonkfun-claim.xyz/docs" },
    ]);
  });

  it("leaves names that only look close alone", () => {
    expect(kinds("stonks.lol")).toEqual(["unknown"]);
    expect(kinds("tonka.com")).toEqual(["unknown"]);
    expect(kinds("https://www.thinkpad.com")).toEqual(["unknown"]);
  });
});

describe("hidden dots", () => {
  it.each([
    ["tonkfun-claim dot xyz", "tonkfun-claim.xyz"],
    ["tonkfun[.]xyz", "tonkfun.xyz"],
    ["claim at evil(.)site today", "evil.site"],
    ["hxxps://evil.xyz/claim", "evil.xyz"],
    ["访问 tonkfun[.]xyz 领取", "tonkfun.xyz"],
    ["visita reclamo dot site", "reclamo.site"],
  ])("%s", (text, domain) => {
    expect(links(text)).toMatchObject([{ domain, kind: "obfuscated", key: domain }]);
  });

  it("keeps ordinary words with 'dot' as words", () => {
    expect(links("the dot com bubble, a polka dot dress")).toEqual([]);
  });

  it("allows the site however its dot is written", () => {
    expect(kinds("tonkfun dot fun")).toEqual(["allowed"]);
  });
});

describe("the allow-list", () => {
  it.each([
    "www.tonkfun.fun",
    "https://www.tonkfun.fun/es/docs#fees",
    "docs at tonkfun.fun/docs",
    "https://tonk-pad.vercel.app",
    `https://robinhoodchain.blockscout.com/address/${WHOA}`,
    "https://solscan.io/tx/5abc",
    "https://explorer.solana.com/address/abc",
    "https://x.com/tonkfun/status/1890",
    "https://twitter.com/TonkFun",
  ])("%s is allowed", (text) => {
    expect(kinds(text)).toEqual(["allowed"]);
  });

  it("allows X only on an official handle's own path", () => {
    expect(links("https://x.com/TonkfunSupport")).toEqual([{ domain: "x.com", kind: "unknown", key: "x.com/tonkfunsupport", raid: "x.com/tonkfunsupport" }]);
  });
});

describe("what isn't a link", () => {
  it.each([
    "what's the fee on Pump.fun?",
    "Bonk.fun and Pump.fun both list it",
    "e.g. this one, i.e. that one",
    "v1.2.3 shipped, 0.5 ETH",
    "see report.pdf and app.js",
    "I did it.It works",
    "write to me@mail.com",
  ])("%s", (text) => {
    expect(links(text)).toEqual([]);
  });

  it("drops a launchpad's bare name even when Telegram marks it, but not a link to it", () => {
    const text = "the fee on Pump.fun?";
    expect(links(text, [urlEntity(text, "Pump.fun")])).toEqual([]);
    expect(kinds("https://pump.fun/coin/abc")).toEqual(["unknown"]);
  });

  it("finds each link once, from its entity and its text", () => {
    const text = "see evil-site.xyz and EVIL-SITE.XYZ/claim";
    expect(links(text, [urlEntity(text, "evil-site.xyz")])).toHaveLength(1);
  });
});

describe("handles and contacts", () => {
  it("finds mentions, not e-mail addresses or paths", () => {
    const text = "@Alice ask @bob_99, write me@mail.com, see medium.com/@writer";
    expect(findHandles(text, [{ type: "mention", offset: 0, length: 6 }]).sort()).toEqual(["alice", "bob_99"]);
  });

  it("counts Telegram's phone and e-mail entities", () => {
    const entities: TgMessageEntity[] = [
      { type: "phone_number", offset: 0, length: 12 },
      { type: "email", offset: 13, length: 10 },
      { type: "email", offset: 24, length: 10 },
    ];
    expect(findContacts(entities)).toEqual({ phones: 1, emails: 2 });
    expect(findContacts([])).toEqual({ phones: 0, emails: 0 });
  });

  it("ignores entities that point outside the text", () => {
    expect(findHandles("hi", [{ type: "mention", offset: 5, length: 9 }])).toEqual([]);
    expect(links("hi", [{ type: "url", offset: -1, length: 40 }])).toEqual([]);
  });

  it("blanks links out of the text, keeping its length", () => {
    const text = `buy ${WHOA} https://www.tonkfun.fun/token/${WHOA}`;
    const stripped = stripLinks(text, []);
    expect(stripped).toHaveLength(text.length);
    expect(stripped.split(WHOA)).toHaveLength(2);
  });
});
