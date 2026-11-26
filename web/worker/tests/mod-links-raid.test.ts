// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AllowList } from "../src/telegram/community/types";
import { findLinks } from "../src/telegram/mod/links";

const ALLOW: AllowList = {
  domains: ["tonkfun.fun", "tonk-pad.vercel.app", "robinhoodchain.blockscout.com", "solscan.io", "explorer.solana.com"],
  telegram: ["tonkfunbot", "tonkfun_launches", "tonkfun_chat"],
  x: ["tonkfun"],
};

const links = (text: string) => findLinks(text, [], ALLOW);

describe("raid keys: host and path, without the query or fragment (abuse#1)", () => {
  const raid = (text: string) => links(text).map((l) => l.raid);

  it.each([
    ["https://evil.xyz/claim?ref=1#top", "evil.xyz/claim"],
    ["tonkfun-airdrop.xyz/claim?ref=7", "tonkfun-airdrop.xyz/claim"],
    ["https://WWW.Evil.XYZ/Claim/", "evil.xyz/Claim"],
    ["evil.xyz/%63laim", "evil.xyz/claim"],
    ["https://evil.xyz//a///b/", "evil.xyz/a/b"],
    ["hxxps://evil.xyz/claim?x=1", "evil.xyz/claim"],
    ["evil[.]xyz", "evil.xyz"],
  ])("%s", (text, key) => {
    expect(raid(text)).toEqual([key]);
  });

  it.each([
    ["https://telegram.me/ScamChannel/12", "t.me/scamchannel/12"],
    ["https://scamchannel.t.me", "t.me/scamchannel"],
    ["t.me/s/ScamChannel/5", "t.me/scamchannel/5"],
    ["t.me/joinchat/AbC", "t.me/+AbC"],
    ["t.me/+AbC?x=1", "t.me/+AbC"],
    ["tg://resolve?domain=ScamSupport", "t.me/scamsupport"],
    ["tg://join?invite=AbC", "t.me/+AbC"],
    ["t.me/c/123/456?thread=1", "t.me/c/123/456"],
  ])("Telegram: %s", (text, key) => {
    expect(raid(text)).toEqual([key]);
  });

  it("X links by account and post; YouTube videos by their id", () => {
    expect(raid("https://twitter.com/Someone/status/1?s=20")).toEqual(["x.com/someone/status/1"]);
    expect(raid("https://mobile.twitter.com/someone")).toEqual(["x.com/someone"]);
    expect(raid("https://www.youtube.com/watch?v=abc123&t=5")).toEqual(["youtube.com/watch?v=abc123"]);
    expect(raid("https://youtube.com/watch?v=xyz789")).not.toEqual(raid("https://youtube.com/watch?v=abc123"));
  });
});

describe("button targets (abuse#7)", () => {
  it("reads each target like a link in the text", () => {
    expect(findLinks("Claim below", [], ALLOW, ["https://tonkfun-claim.xyz/start", "https://www.tonkfun.fun/docs", "https://t.me/+Vip"]).map((l) => l.kind)).toEqual([
      "lookalike",
      "allowed",
      "telegram_invite",
    ]);
  });

  it("finds a link once when the text and a button share it, and skips targets that aren't links", () => {
    expect(findLinks("see evil-site.xyz", [], ALLOW, ["https://evil-site.xyz", "", "   "])).toHaveLength(1);
  });
});
