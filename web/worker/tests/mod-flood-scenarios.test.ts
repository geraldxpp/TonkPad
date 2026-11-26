// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type FloodResult, FloodWatch } from "../src/telegram/mod/flood";
import { burstOf } from "../src/telegram/mod/media";
import { checkMessage, type RuleInput } from "../src/telegram/mod/rules";
import { raidKeysOf, reportOf, severeKeysOf } from "../src/telegram/mod/rules-scan";
import type { TgMessage } from "../src/telegram/types";
import { groupMessage } from "./community-fixtures";
import { NOW, SEC } from "./fixtures";
import { input, WHOA } from "./mod-rules-fixtures";

/**
 * The reviews' scenarios, end to end through the rules' markers and the
 * flood watch, noted the way the pipeline notes a new message: its raid keys
 * (raidKeysOf) and severe ones (severeKeysOf), whether its author is new,
 * its album or forward (burstOf), and a report (reportOf) exempt from being
 * a raider.
 */

const SOL = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
let nextId = 10_000;

function post(watch: FloodWatch, user: number, text: string, atSec: number, extra: Partial<RuleInput> = {}): FloodResult {
  const { markers } = checkMessage(input(text, extra));
  nextId += 1;
  const newcomer = extra.standing === "new";
  return watch.note({ chat: -100777, user, messageId: nextId, text, keys: raidKeysOf(markers), severe: severeKeysOf(markers), newcomer, sticker: null, strictness: "normal", exempt: reportOf(markers), now: NOW + atSec * SEC });
}

/** Three or more members, 10 seconds apart, each posting their own text. */
const round = (watch: FloodWatch, texts: readonly string[], extra: Partial<RuleInput> = {}) => texts.map((text, i) => post(watch, 201 + i, text, i * 10, extra));
const quiet = (results: readonly FloodResult[]) => results.every((r) => r.linkRaid === null && !r.textRaid);

describe("what members share is no link raid (abuse#1)", () => {
  it("the same token address, written in any words, even by new members", () => {
    expect(quiet(round(new FloodWatch(), [`aped ${WHOA}`, `${WHOA} chart looks good`, `WHOA ${WHOA} to the moon`, `CA: ${WHOA}`]))).toBe(true);
    expect(quiet(round(new FloodWatch(), [SOL, `buy ${SOL}`, `${SOL} lfg`], { standing: "new" }))).toBe(true);
  });

  it("the bot's own /check, by address or by link, from many members", () => {
    const watch = new FloodWatch();
    expect(quiet(Array.from({ length: 10 }, (_, i) => post(watch, 300 + i, `/check ${WHOA}`, i * 5)))).toBe(true);
    expect(quiet(round(new FloodWatch(), ["/check https://pump.fun/coin/abc", "/check@TonkfunBot https://pump.fun/coin/abc", "/check pump.fun/coin/abc"]))).toBe(true);
  });

  it("greeting the same member, or a framing aimed at a trusted one", () => {
    expect(quiet(round(new FloodWatch(), ["@alice_doe", "gm @alice_doe", "welcome @alice_doe!"]))).toBe(true);
    const watch = new FloodWatch();
    const framed = [post(watch, 201, "big thanks to @alice_doe for the help yesterday", 0, { standing: "trusted" }), post(watch, 902, "@alice_doe", 5), post(watch, 903, "@alice_doe", 10)];
    expect(quiet(framed)).toBe(true);
  });

  it("different pages of one site, or different posts of one account", () => {
    expect(quiet(round(new FloodWatch(), ["chart dexscreener.com/solana/aaa111", "dexscreener.com/solana/bbb222 looks good", "https://dexscreener.com/solana/ccc333"]))).toBe(true);
    expect(quiet(round(new FloodWatch(), ["https://x.com/someone/status/1", "https://x.com/someone/status/2", "https://twitter.com/someone/status/3"]))).toBe(true);
  });

  it("links to the site and the official channel never count", () => {
    expect(quiet(round(new FloodWatch(), ["docs: https://www.tonkfun.fun/docs", "https://tonkfun.fun/docs#fees", "t.me/tonkfun_launches/12"]))).toBe(true);
  });
});

describe("a real link raid still is one", () => {
  const airdrop = (n: number) => `Claim your TONK airdrop now: tonkfun-airdrop.xyz/claim?ref=${n}`;

  it("the same drainer page with different referral codes: every copy at the third account, then each new one (abuse#1, abuse#5)", () => {
    const watch = new FloodWatch();
    const results = [1, 2, 3, 4, 5].map((n, i) => post(watch, 401 + i, airdrop(n), i * 5, { standing: "new" }));
    expect(results.slice(0, 2).every((r) => r.linkRaid === null)).toBe(true);
    expect(results[2].linkRaid?.map((c) => c.user)).toEqual([401, 402, 403]);
    expect(results[3].linkRaid?.map((c) => c.user)).toEqual([404]);
    expect(results[4].linkRaid?.map((c) => c.user)).toEqual([405]);
    expect(checkMessage(input(airdrop(1))).markers.question).toBe(false);
  });

  it("a warning that quotes the link counts toward raid mode, but is never a raider", () => {
    const watch = new FloodWatch();
    const results = [
      post(watch, 501, airdrop(1), 0, { standing: "new" }),
      post(watch, 502, "careful, tonkfun-airdrop.xyz/claim is a scam, don't click", 5, { standing: "new" }),
      post(watch, 503, "beware tonkfun-airdrop.xyz/claim?ref=9 is fake", 10, { standing: "new" }),
      post(watch, 504, airdrop(4), 15, { standing: "new" }),
      post(watch, 505, airdrop(5), 20, { standing: "new" }),
    ];
    expect(results[2].linkRaid).toEqual([]);
    expect(results[4].linkRaid?.map((c) => c.user)).toEqual([501, 504, 505]);
  });

  it("an endorsed copy is no report, so it makes a raider (rules#5)", () => {
    const watch = new FloodWatch();
    const legit = (n: number) => `100% legit, claim your TONK airdrop at tonkfun-airdrop.xyz/claim?ref=${n}`;
    const results = [1, 2, 3].map((n, i) => post(watch, 801 + i, legit(n), i * 5, { standing: "new" }));
    expect(results[2].linkRaid?.map((c) => c.user)).toEqual([801, 802, 803]);
  });

  it("the same Telegram invite from three new members", () => {
    const results = round(new FloodWatch(), ["join t.me/+AbCdEf123 for signals", "https://t.me/joinchat/AbCdEf123", "VIP: t.me/+AbCdEf123"], { standing: "new" });
    expect(results[2].linkRaid?.map((c) => c.user)).toEqual([201, 202, 203]);
    expect(round(new FloodWatch(), ["join t.me/+AbCdEf123 for signals", "https://t.me/joinchat/AbCdEf123", "VIP: t.me/+AbCdEf123"])[2].linkRaid).toEqual([]);
  });
});

describe("albums and forward bursts, as Telegram delivers them (abuse#8)", () => {
  /** A member's messages noted in one second, the way the pipeline notes each. */
  function deliver(watch: FloodWatch, messages: readonly TgMessage[], strictness: "normal" | "strict" = "normal") {
    return messages.map((m) => watch.note({ chat: -100777, user: 101, messageId: m.message_id, text: m.caption ?? m.text ?? "", keys: [], sticker: null, ...burstOf(m), strictness, exempt: false, now: NOW }));
  }

  it("8 screenshots in one album are no flood, nor 6 in strict mode", () => {
    const album = (n: number) => Array.from({ length: n }, (_, i) => groupMessage("", { photo: [{}], media_group_id: "13579", caption: i === 0 ? "my launch failed, see screenshots" : undefined }));
    expect(deliver(new FloodWatch(), album(8)).every((r) => r.flood === null)).toBe(true);
    expect(deliver(new FloodWatch(), album(6), "strict").every((r) => r.flood === null)).toBe(true);
  });

  it("forwarding 9 messages at once is no flood", () => {
    const origin = { type: "hidden_user" as const, date: 1_700_000_000, sender_user_name: "Someone" };
    const forwards = Array.from({ length: 9 }, () => groupMessage("forwarded", { forward_origin: origin }));
    expect(deliver(new FloodWatch(), forwards).every((r) => r.flood === null)).toBe(true);
  });

  it("8 separate messages in a second still flood", () => {
    const results = deliver(new FloodWatch(), Array.from({ length: 8 }, () => groupMessage("spam")));
    expect(results[7].flood).toHaveLength(8);
  });
});
