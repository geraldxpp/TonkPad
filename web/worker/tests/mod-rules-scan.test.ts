// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Markers } from "../src/telegram/community/types";
import { checkMessage, type RuleInput } from "../src/telegram/mod/rules";
import { isQuestion, raidKeysOf, scanMessage, type ScanMarkers } from "../src/telegram/mod/rules-scan";
import type { TgMessageEntity } from "../src/telegram/types";
import { input, urlEntity, WHOA } from "./mod-rules-fixtures";

/** A rule input with the message's button targets (media.ts buttonLinks), as the pipeline passes them. */
const withButtons = (text: string, buttons: unknown, extra: Partial<RuleInput> = {}): RuleInput => ({ ...input(text, extra), buttons }) as RuleInput;
const scan = (text: string, extra: Partial<RuleInput> = {}, buttons?: unknown) => scanMessage(withButtons(text, buttons, extra));
const raidKeys = (text: string, entities: TgMessageEntity[] = []) => [...scan(text, { entities }).markers.raidKeys].sort();
const cats = (rule: RuleInput) => checkMessage(rule).hits.map((h) => h.category).sort();

describe("isQuestion ignores links and handles (abuse#5)", () => {
  it.each([
    "Claim your TONK airdrop now: tonkfun-airdrop.xyz/claim?ref=5",
    "Free claim https://evil.xyz/?ref=1&utm_source=tg now",
    "go https://evil.xyz/claim?ref=1#top",
    "tonkfun-airdrop[.]xyz/claim?ref=5 is live",
    "tonkfun-airdrop dot xyz/claim?ref=5 is live",
    "hxxps://evil.xyz/claim?ref=5",
    "join t.me/joinchat/AbC?start=1 today",
  ])("a ? inside a link is no question: %s", (text) => {
    expect(isQuestion(text)).toBe(false);
  });

  it("reads a url entity's link as a link", () => {
    const text = "Claim now: claim-tonk.app/r?id=7";
    expect(isQuestion(text, [urlEntity(text, "claim-tonk.app/r?id=7")])).toBe(false);
  });

  it.each(["is https://evil.xyz/claim legit?", "is evil.xyz safe?", "¿es real t.me/+AbC?", "is @CryptoFixer the real admin?", "how do I launch a token", "这个是真的吗?我不知道"])(
    "a real question still is one: %s",
    (text) => {
      expect(isQuestion(text)).toBe(true);
    },
  );

  it("the markers read questions the same way", () => {
    expect(scan("Claim your TONK airdrop now: tonkfun-airdrop.xyz/claim?ref=5").markers.question).toBe(false);
    expect(scan("is tonkfun-airdrop.xyz real?").markers.question).toBe(true);
  });
});

describe("raid keys: risky links by host and path, never handles, addresses or the query (abuse#1)", () => {
  it("keys a risky link by its normalized host and path, without the query or fragment", () => {
    expect(raidKeys("Claim your TONK airdrop now: tonkfun-airdrop.xyz/claim?ref=1")).toEqual(["tonkfun-airdrop.xyz/claim"]);
    expect(raidKeys("Claim at https://TONKFUN-AIRDROP.xyz/claim/?ref=2#go")).toEqual(["tonkfun-airdrop.xyz/claim"]);
    expect(raidKeys("https://www.pumpsignals.site")).toEqual(["pumpsignals.site"]);
  });

  it("different pages of one site, or different posts of one account, are different keys", () => {
    expect(raidKeys("chart dexscreener.com/solana/aaa111")).not.toEqual(raidKeys("chart dexscreener.com/solana/bbb222"));
    expect(raidKeys("https://x.com/someone/status/1")).not.toEqual(raidKeys("https://x.com/someone/status/2"));
  });

  it("never keys an @handle or a token address; linkKeys keeps them for the edit memory", () => {
    const { markers } = scan(`gm @alice_doe, aped ${WHOA}`);
    expect(markers.raidKeys).toEqual([]);
    expect([...markers.linkKeys].sort()).toEqual(["@alice_doe", WHOA].sort());
  });

  it("keys Telegram links apart from mentions, and never an allowed or official link", () => {
    expect(raidKeys("join t.me/ScamChannel")).toEqual(["t.me/scamchannel"]);
    expect(raidKeys("join t.me/+AbCdEf")).toEqual(["t.me/+AbCdEf"]);
    expect(raidKeys("https://www.tonkfun.fun/docs and t.me/tonkfun_launches and @ScamChannel")).toEqual([]);
  });

  it("a link with no ? reads the same whether or not Telegram marked it", () => {
    const text = "see evil-site.xyz/claim";
    expect(raidKeys(text, [urlEntity(text, "evil-site.xyz/claim")])).toEqual(["evil-site.xyz/claim"]);
  });

  it("never keys a message that opens with a bot command", () => {
    expect(raidKeys("/check https://pump.fun/coin/abc")).toEqual([]);
    expect(raidKeys("/check@TonkfunBot evil-site.xyz/claim")).toEqual([]);
    expect(raidKeys("see /check evil-site.xyz/claim")).toEqual(["evil-site.xyz/claim"]);
  });

  it("raidKeysOf reads them back from a rules result, and finds none on markers without them", () => {
    const { markers } = checkMessage(input("Claim now: tonkfun-airdrop.xyz/claim?ref=3"));
    expect(raidKeysOf(markers)).toEqual(["tonkfun-airdrop.xyz/claim"]);
    const plain: Markers = { ...markers };
    delete (plain as Partial<ScanMarkers>).raidKeys;
    expect(raidKeysOf(plain)).toEqual([]);
    expect(raidKeysOf({ ...markers, raidKeys: [7, "a.xyz/b", null] } as unknown as Markers)).toEqual(["a.xyz/b"]);
  });
});

describe("untrusted entities", () => {
  it("isQuestion and the scan skip malformed entities instead of throwing", () => {
    const broken = [null, 7, { offset: 0, length: 3 }, { type: "mention", offset: 0, length: 6 }] as unknown as TgMessageEntity[];
    expect(isQuestion("@alice is it live?", broken)).toBe(true);
    expect(() => scan("@alice see evil.xyz", { entities: broken })).not.toThrow();
    expect(isQuestion(7 as unknown as string)).toBe(false);
  });
});

describe("button targets are read like links (abuse#7)", () => {
  const LOOKALIKE = "https://tonkfun-claim.xyz/start";

  it("a button's look-alike link is a scam, for members and trusted members", () => {
    expect(cats(withButtons("Claim your TONK reward below", [LOOKALIKE]))).toContain("lookalike");
    expect(cats(withButtons("Claim your TONK reward below", [LOOKALIKE], { standing: "trusted" }))).toContain("lookalike");
  });

  it("a button's unknown link is an unknown link for a member and a newcomer link for a new member", () => {
    expect(cats(withButtons("Crypto Daily: today's news", ["https://cryptodaily-news.site/today"]))).toEqual(["unknown_link"]);
    expect(cats(withButtons("Crypto Daily: today's news", ["https://cryptodaily-news.site/today"], { standing: "new" }))).toEqual(["newcomer_link"]);
  });

  it("a button's invite link is an invite link", () => {
    expect(cats(withButtons("Join the VIP group", ["https://t.me/+VipGroup123"]))).toContain("invite_link");
  });

  it("feeds the markers: domains, unknown links and raid keys", () => {
    const { markers } = scan("Claim below", {}, [LOOKALIKE, "https://www.tonkfun.fun/docs"]);
    expect(markers.unknownLinks).toBe(1);
    expect([...markers.domains].sort()).toEqual(["tonkfun-claim.xyz", "tonkfun.fun"]);
    expect(markers.raidKeys).toEqual(["tonkfun-claim.xyz/start"]);
  });

  it("allowed buttons, an admin's buttons and malformed targets add nothing", () => {
    expect(cats(withButtons("Open", ["https://www.tonkfun.fun/token/0xabc"]))).toEqual([]);
    expect(cats(withButtons("Claim", [LOOKALIKE], { standing: "admin" }))).toEqual([]);
    for (const broken of ["https://evil.xyz", 7, null, { url: "https://evil.xyz" }, [7, null, { x: 1 }]]) {
      expect(() => checkMessage(withButtons("gm", broken))).not.toThrow();
      expect(cats(withButtons("gm", broken))).toEqual([]);
    }
  });
});
