// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STRICTNESS_LEVELS } from "../src/telegram/community/types";
import type { RuleInput } from "../src/telegram/mod/rules";
import { ALLOW, cats, check, hit, WHOA } from "./mod-rules-fixtures";

/**
 * Who vouches for a forward (mod/rules-forwards.ts vouched), so it is never
 * a brand forward (brandForward) nor a new member's link (newcomerForward).
 * The bot's own message is known by the bot's ID alone (forwardSelf:
 * agent/triggers.ts forwardedFromMe), never by one of its usernames, which
 * can pass to another account: say, one the bot dropped while the worker
 * keeps its startup getMe, whose usernames the allow-list holds too
 * (community/index-setup.ts allowListOf). An admin's own message is known by
 * the user forward's ID too (forwardAdmin), with or without a username, and
 * the official channel's post by its chat ID (forwardChannel). The official
 * channel, the community groups and the admins still vouch by username as
 * well.
 */

/** The bot as the worker read it at start, with an old username it has since dropped, and the allow-list built from that. */
const WITH_OLD: Partial<RuleInput> = { bot: ["TonkfunBot", "TonkpadBot"], allow: { ...ALLOW, telegram: [...ALLOW.telegram, "tonkpadbot"] } };
/** A member's forward from `forwardName` (whose username is `forwardUsername`), in normal mode. */
const forward = (forwardName: string, forwardUsername: string | null, extra: Partial<RuleInput> = {}): Partial<RuleInput> => ({ forwarded: true, forwardName, forwardUsername, ...WITH_OLD, ...extra });

describe("a forward of the bot's own message", () => {
  it("is never a brand forward, known by the bot's ID", () => {
    expect(cats("gm", forward("TonkFun", "tonkfunbot", { forwardSelf: true }))).toEqual([]);
    expect(cats("gm", forward("TonkFun", null, { forwardSelf: true }))).toEqual([]);
    expect(cats("gm", forward("TonkFun Support", "tonkfunbot", { forwardSelf: true, strictness: "strict" }))).toEqual([]);
  });
});

describe("an account holding one of the bot's usernames", () => {
  it("vouches for nothing: its forward is judged by its name, like anyone's", () => {
    expect(hit("gm", "brand_forward", forward("TonkFun Support", "tonkpadbot"))).toMatchObject({ severity: "notice", certain: false });
    expect(cats("gm", forward("TonkFun", "tonkfunbot"))).toEqual(["brand_forward"]);
    expect(cats("gm", forward("TonkFun", "TonkpadBot", { forwardSelf: false }))).toEqual(["brand_forward"]);
    expect(hit("gm", "brand_forward", forward("TonkFun Support", "tonkpadbot", { strictness: "relaxed" }))).toMatchObject({ severity: "alert" });
  });

  it("vouches for nothing through the admin list either, which Telegram gives with the bot on it", () => {
    const admins = [{ name: "Alex Admin", username: "alex_admin" }, { name: "TonkFun", username: "TonkfunBot" }];
    expect(cats("gm", forward("TonkFun Support", "tonkfunbot", { admins }))).toEqual(["brand_forward"]);
  });

  it("named like nobody in particular is fine", () => {
    expect(cats("gm", forward("Daily News", "tonkpadbot"))).toEqual([]);
  });
});

describe("the official channel, the community groups and the admins", () => {
  it("still vouch for their forwards by username", () => {
    expect(cats("gm", forward("Tonkfun Launches", "tonkfun_launches"))).toEqual([]);
    expect(cats("gm", forward("Tonkfun Chat", "tonkfun_chat"))).toEqual([]);
    expect(cats("gm", forward("Tonkfun Mod Alex", "alex_admin"))).toEqual([]);
  });

  it("vouch for no one else: a look-alike of theirs, or a team-like name without a username, is a brand forward", () => {
    expect(cats("gm", forward("Tonkfun Launches", "tonkfun_launches_official"))).toEqual(["brand_forward"]);
    expect(cats("gm", forward("Crypto Support Hub", null))).toEqual(["brand_forward"]);
  });
});

describe("an admin's own message, known by the user forward's ID (forwardAdmin)", () => {
  it("is never a brand forward, with no username or one the admin list doesn't hold, though the name uses a role word or the brand", () => {
    expect(cats("gm", forward("Alex Admin", null, { forwardAdmin: true }))).toEqual([]);
    expect(cats("gm", forward("TonkFun Team", null, { forwardAdmin: true, strictness: "strict" }))).toEqual([]);
    expect(cats("gm", forward("Tonkfun Mod Kai", "kai_mod", { forwardAdmin: true, strictness: "relaxed" }))).toEqual([]);
  });

  it("vouches for that account alone: the same name from anyone else is judged by it", () => {
    expect(cats("gm", forward("Alex Admin", null))).toEqual(["brand_forward"]);
    expect(hit("gm", "brand_forward", forward("TonkFun Team", null, { forwardAdmin: false, strictness: "strict" }))).toMatchObject({ severity: "notice", certain: false });
  });
});

describe("the official channel's post, known by its chat ID (forwardChannel: media.ts fromChannel)", () => {
  it("is never a brand forward nor a new member's link, with no username or one the allow-list doesn't hold, in every mode", () => {
    for (const strictness of STRICTNESS_LEVELS) {
      expect(cats("gm", forward("Tonkfun Launches", null, { forwardChannel: true, strictness })), strictness).toEqual([]);
      expect(cats("gm", forward("TonkFun Official", "tonkfun_news", { forwardChannel: true, standing: "new", strictness })), strictness).toEqual([]);
    }
  });

  it("vouches for that chat alone: the same name and username from another chat is judged by them", () => {
    expect(cats("gm", forward("TonkFun Official", "tonkfun_news", { forwardChannel: false }))).toEqual(["brand_forward"]);
    expect(cats("gm", forward("TonkFun Official", "tonkfun_news", { standing: "new" }))).toEqual(["newcomer_link"]);
  });
});

describe("a new member's forward (newcomerForward): a link unless its author vouches for it", () => {
  /** A new member's forward from `forwardName` (whose username is `forwardUsername`). */
  const newcomer = (forwardName: string, forwardUsername: string | null, extra: Partial<RuleInput> = {}): Partial<RuleInput> => ({ standing: "new", ...forward(forwardName, forwardUsername, extra) });

  it("is no link from the bot or an admin by ID, or the official channel, a community group or an admin by username, in every mode", () => {
    for (const strictness of STRICTNESS_LEVELS) {
      expect(cats("gm", newcomer("TonkFun", "tonkfunbot", { forwardSelf: true, strictness })), strictness).toEqual([]);
      expect(cats("gm", newcomer("Alex Admin", null, { forwardAdmin: true, strictness })), strictness).toEqual([]);
      expect(cats("gm", newcomer("Tonkfun Launches", "tonkfun_launches", { strictness })), strictness).toEqual([]);
      expect(cats("gm", newcomer("Tonkfun Chat", "tonkfun_chat", { strictness })), strictness).toEqual([]);
      expect(cats("gm", newcomer("Alex", "alex_admin", { strictness })), strictness).toEqual([]);
    }
  });

  it("is one from anyone else: a stranger, a look-alike of a voucher, or an account holding one of the bot's usernames", () => {
    const others = [forward("Daily News", null), forward("Tonkfun Launches", "tonkfun_launches_official"), forward("TonkFun", "tonkfunbot"), forward("TonkFun", "tonkpadbot"), forward("TonkFun", "tonkfunbot", { forwardSelf: false })];
    for (const strictness of STRICTNESS_LEVELS) {
      for (const extra of others) expect(cats("gm", { ...extra, standing: "new", strictness }), `${strictness} ${extra.forwardName}`).toEqual(["newcomer_link"]);
    }
  });

  it("still reads what a vouched forward says: its links and link buttons count; its handles and addresses are left to the check", () => {
    const vouched = newcomer("Tonkfun Launches", "tonkfun_launches");
    expect(cats("launch notes at pumpsignals.site", vouched)).toEqual(["newcomer_link"]);
    expect(cats("gm", { ...vouched, buttons: ["https://pumpsignals.site/today"] })).toEqual(["newcomer_link"]);
    expect(cats("gm", { ...vouched, viaButtons: true })).toEqual(["newcomer_link"]);
    expect(cats("gm", { ...vouched, externalOtherChat: true })).toEqual(["newcomer_link"]);
    const kept = check(`new launch by @kai_trades: ${WHOA}`, vouched);
    expect(kept.hits).toEqual([]);
    expect(kept.markers.linkKeys).toEqual(expect.arrayContaining(["@kai_trades", WHOA]));
  });
});
