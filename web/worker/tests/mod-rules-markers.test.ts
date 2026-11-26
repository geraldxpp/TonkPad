// @vitest-environment node
import { describe, expect, it } from "vitest";
import { externalFromOtherChat, forwardName, forwardUsername, riskyFile, viaButtons } from "../src/telegram/mod/media";
import { checkMessage, type RuleInput } from "../src/telegram/mod/rules";
import type { TgMessage, TgMessageEntity } from "../src/telegram/types";
import { groupMessage, GROUP_ID } from "./community-fixtures";
import { cats, check, EN_12, input, PACK, TX_HASH, urlEntity, WHOA } from "./mod-rules-fixtures";

describe("must pass", () => {
  it.each(["what's the fee on Pump.fun?", "¿cuál es la comisión en Pump.fun?", "какая комиссия на Pump.fun?", "Pump.fun 的手续费是多少？"])("%s", (text) => {
    const result = check(text, { entities: [urlEntity(text, "Pump.fun")] });
    expect(result.hits).toEqual([]);
    expect(result.markers.question).toBe(true);
  });

  it.each([`check my tx ${TX_HASH}`, "great guide: https://www.tonkfun.fun/docs", "good morning everyone", "gm gm, love this community", "Hola a todos, buenos días", "Всем привет", "大家好"])(
    "%s",
    (text) => {
      expect(check(text).hits).toEqual([]);
    },
  );
});

describe("markers", () => {
  it.each([
    ["how do I launch a token", true],
    ["¿cómo lanzo un token?", true],
    ["como funciona la curva", true],
    ["как запустить токен", true],
    ["怎么发币", true],
    ["gm everyone", false],
    ["great project", false],
    ["Was hoping for more", false],
  ])("question: %s", (text, question) => {
    expect(check(text).markers.question).toBe(question);
  });

  it("keys unknown links, other people's handles and addresses outside the pack, for raid matching", () => {
    const text = `join t.me/pumpgroup, ask @CryptoGuru, buy ${WHOA}, see evil-site.xyz; also t.me/tonkfun_launches, @TonkfunBot, @alex_admin, ${PACK}`;
    const { markers } = check(text);
    expect([...markers.linkKeys].sort()).toEqual(["@cryptoguru", "@pumpgroup", WHOA, "evil-site.xyz"].sort());
    expect(markers.unknownLinks).toBe(2);
    expect(markers.handles).toBe(2);
    expect([...markers.addresses].sort()).toEqual([PACK, WHOA].sort());
    expect([...markers.domains].sort()).toEqual(["evil-site.xyz", "t.me"]);
  });

  it("an address inside an allowed link is an address, not raid material; a hash is neither", () => {
    const { markers } = check(`https://www.tonkfun.fun/token/${WHOA} and ${TX_HASH}`);
    expect(markers.addresses).toEqual([WHOA]);
    expect(markers.linkKeys).toEqual([]);
  });

  it("flags help, DM and report words, and counts words", () => {
    expect(check("my buy failed, help").markers.helpWords).toBe(true);
    expect(check("he sent me a DM").markers.dmWords).toBe(true);
    expect(check("this is a scam").markers.reportWords).toBe(true);
    expect(check("gm").markers).toMatchObject({ helpWords: false, dmWords: false, reportWords: false, crisis: null, words: 1 });
    expect(check("hello there friend").markers.words).toBe(3);
    expect(check("你好吗朋友们").markers.words).toBe(3);
  });
});

describe("untrusted input", () => {
  it("a malformed update never throws", () => {
    const broken = { ...input("gm"), text: undefined, entities: "oops", sender: {}, admins: [null], forwardName: 7 } as unknown as RuleInput;
    expect(() => checkMessage(broken)).not.toThrow();
    expect(checkMessage(broken).hits).toEqual([]);
    const outside: TgMessageEntity[] = [{ type: "url", offset: 9_999, length: 40 }, { type: "code", offset: -5, length: 2 }];
    expect(cats("gm", { entities: outside })).toEqual([]);
  });
});

describe("media", () => {
  const doc = (file_name?: string, mime_type?: string): TgMessage => groupMessage("", { document: { file_name, mime_type } });

  it("an executable or archive is risky, by its last extension or its type", () => {
    for (const name of ["wallet-fix.apk", "invoice.pdf.exe", "Setup.MSI", "run.bat ", "tool.7z", "photo‮gpj.exe", "airdrop.zip."]) expect(riskyFile(doc(name))).toBe(true);
    expect(riskyFile(doc("file", "application/vnd.android.package-archive"))).toBe(true);
    for (const name of ["whitepaper.pdf", "chart.png", "notes.txt", "zip"]) expect(riskyFile(doc(name))).toBe(false);
    expect(riskyFile(groupMessage("no file"))).toBe(false);
  });

  it("another bot's message with link buttons", () => {
    const via = { id: 5, is_bot: true, first_name: "Promo", username: "promo_bot" };
    expect(viaButtons(groupMessage("hi", { via_bot: via, reply_markup: { inline_keyboard: [[{ text: "Claim", url: "https://evil.xyz" }]] } }))).toBe(true);
    expect(viaButtons(groupMessage("hi", { via_bot: via, reply_markup: { inline_keyboard: [[{ text: "Vote", callback_data: "v" }]] } }))).toBe(false);
    expect(viaButtons(groupMessage("hi", { reply_markup: { inline_keyboard: [[{ text: "Claim", url: "https://evil.xyz" }]] } }))).toBe(false);
  });

  it("a reply to another chat, but not to another topic of this one", () => {
    expect(externalFromOtherChat(groupMessage("hi", { external_reply: { chat: { id: -100555, type: "supergroup" } } }))).toBe(true);
    expect(externalFromOtherChat(groupMessage("hi", { external_reply: {} }))).toBe(true);
    expect(externalFromOtherChat(groupMessage("hi", { external_reply: { chat: { id: GROUP_ID, type: "supergroup" } } }))).toBe(false);
    expect(externalFromOtherChat(groupMessage("hi"))).toBe(false);
  });

  it("a forward's name and username", () => {
    const channel = groupMessage("news", { forward_origin: { type: "channel", date: 1, chat: { id: -100777, type: "channel", title: "Tonkfun Launches", username: "Tonkfun_Launches" } } });
    expect(forwardName(channel)).toBe("Tonkfun Launches");
    expect(forwardUsername(channel)).toBe("tonkfun_launches");
    const user = groupMessage("hi", { forward_origin: { type: "user", date: 1, sender_user: { id: 9, first_name: "Alex", last_name: "Admin", username: "alex_admin" } } });
    expect(forwardName(user)).toBe("Alex Admin");
    expect(forwardName(groupMessage("hi", { forward_origin: { type: "hidden_user", date: 1, sender_user_name: "Crypto Support" } }))).toBe("Crypto Support");
    expect(forwardUsername(groupMessage("hi", { forward_origin: { type: "hidden_user", date: 1, sender_user_name: "Crypto Support" } }))).toBeNull();
    expect(forwardName(groupMessage("not forwarded"))).toBeNull();
  });
});

describe("self-harm", () => {
  it.each([
    ["English", "I want to die, I lost everything on this", "strong"],
    ["Spanish", "ya no puedo, quiero morir", "strong"],
    ["Russian", "я хочу умереть", "strong"],
    ["English", "I lost everything today", "weak"],
    ["Spanish", "lo perdí todo", "weak"],
    ["Russian", "потерял все деньги", "weak"],
  ])("%s: %s", (_, text, crisis) => {
    const result = check(text);
    expect(result.markers.crisis).toBe(crisis);
    expect(result.hits).toEqual([]);
  });

  it("a strong phrase changes no hit: the decision spares the member, and the link or secret is still removed (injection#2)", () => {
    expect(cats("I want to die, tonkfun-claim.xyz drained me")).toEqual(["lookalike", "phishing"]);
    expect(cats(`I want to die. ${EN_12}`)).toEqual(["secret"]);
  });
});

describe("edits and stale messages", () => {
  it("adding a link the bot remembers the original without is an offence", () => {
    expect(cats("now see pumpsignals.site", { edited: true, addedLinks: true })).toEqual(["edited_spam", "unknown_link"]);
    expect(cats("now see pumpsignals.site", { edited: true, addedLinks: false })).toEqual(["unknown_link"]);
    expect(cats("now see pumpsignals.site", { edited: true, addedLinks: null })).toEqual(["unknown_link"]);
  });

  it("an old message's edit is checked in full, not as a stale one", () => {
    expect(cats("call +15551234567", { edited: true, ageSeconds: 200_000, entities: [{ type: "phone_number", offset: 5, length: 12 }] })).toEqual(["contact_info"]);
  });

  it("a stale message keeps only its certain, deleting hits", () => {
    const entities: TgMessageEntity[] = [{ type: "phone_number", offset: 0, length: 12 }];
    expect(cats("+15551234567 t0nkfun.app", { ageSeconds: 600, entities })).toEqual(["lookalike"]);
    expect(cats(EN_12, { ageSeconds: 600 })).toEqual(["secret"]);
    expect(cats("I will kill you, see pumpsignals.site", { ageSeconds: 600 })).toEqual([]);
    expect(cats("a guy wrote 'DM me for support', is this a scam?", { ageSeconds: 600 })).toEqual([]);
  });
});

describe("admins", () => {
  it.each([EN_12, "tonkfun-claim.xyz", "DM me for help", "join t.me/+AbC", "I will kill you", "pumpsignals.site"])("never get a hit: %s", (text) => {
    const result = check(text, { standing: "admin", sender: { name: "Tonkfun Support", username: "alex_admin", tag: "Admin" } });
    expect(result.hits).toEqual([]);
    expect(result.markers.words).toBeGreaterThan(0);
  });
});
