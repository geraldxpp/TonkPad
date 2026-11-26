// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inlineArticle } from "../src/telegram/inline";
import { burstOf, buttonLinks, viaButtons } from "../src/telegram/mod/media";
import { checkMessage, type RuleInput } from "../src/telegram/mod/rules";
import type { TgMessage, TgUser } from "../src/telegram/types";
import { BOT, BOT_ID, groupMessage } from "./community-fixtures";
import { input } from "./mod-rules-fixtures";
import { SITE, token } from "./telegram-fixtures";

const ME = { id: BOT_ID, usernames: ["TonkfunBot"] };
const PROMO: TgUser = { id: 5, is_bot: true, first_name: "Promo", username: "promo_bot" };
const CLAIM = "https://tonkfun-claim.xyz";
const markup = (...buttons: unknown[]) => ({ inline_keyboard: [buttons] }) as unknown as TgMessage["reply_markup"];
/** The bot's own token card, shared in the group through its inline mode (@TonkfunBot <address>), as Telegram delivers it: text without the HTML. */
const ownCard = (): TgMessage => {
  const card = inlineArticle(token(), "en", SITE);
  return groupMessage(card.input_message_content.message_text.replace(/<[^>]+>/g, ""), { via_bot: BOT, reply_markup: card.reply_markup });
};

describe("another bot's link buttons (telegram#5)", () => {
  it("the bot's own inline card is not another bot's, by its ID or any of its usernames", () => {
    expect(viaButtons(ownCard(), ME)).toBe(false);
    expect(viaButtons(ownCard(), { id: 1, usernames: ["Other", "TONKFUNBOT"] })).toBe(false);
  });

  it("another bot's link buttons still count, and so does any bot when the bot doesn't know itself", () => {
    expect(viaButtons(groupMessage("hi", { via_bot: PROMO, reply_markup: markup({ text: "Claim", url: CLAIM }) }), ME)).toBe(true);
    expect(viaButtons(groupMessage("hi", { via_bot: PROMO, reply_markup: markup({ text: "Vote", callback_data: "v" }) }), ME)).toBe(false);
    expect(viaButtons(ownCard())).toBe(true);
    expect(viaButtons(ownCard(), null)).toBe(true);
  });

  it("a new member sharing the bot's own card gets no newcomer hit", () => {
    const m = ownCard();
    const rule: RuleInput = { ...input(m.text ?? "", { standing: "new" }), viaButtons: viaButtons(m, ME), buttons: buttonLinks(m, ME) } as RuleInput;
    expect(checkMessage(rule).hits).toEqual([]);
  });
});

describe("button targets (abuse#7)", () => {
  it("reads url, login_url and web_app targets, and nothing else", () => {
    const m = groupMessage("Claim your TONK reward below", {
      via_bot: PROMO,
      reply_markup: markup(
        { text: "Claim", url: CLAIM },
        { text: "Log in", login_url: { url: "https://login-tonk.xyz/auth" } },
        { text: "App", web_app: { url: "https://tonk-app.site/start" } },
        { text: "Vote", callback_data: "v" },
        { text: "Share", switch_inline_query: "x" },
        { text: "Copy", copy_text: { text: "https://copied.xyz" } },
      ),
    });
    expect(buttonLinks(m, ME)).toEqual([CLAIM, "https://login-tonk.xyz/auth", "https://tonk-app.site/start"]);
  });

  it("reads a forward's and a member's own message's buttons too", () => {
    const forward = groupMessage("Crypto Daily", { forward_origin: { type: "channel", date: 1, chat: { id: -100777, type: "channel", title: "Crypto Daily" } }, reply_markup: markup({ text: "Claim", url: CLAIM }) });
    expect(buttonLinks(forward, ME)).toEqual([CLAIM]);
    expect(buttonLinks(groupMessage("hi", { reply_markup: markup({ text: "Claim", url: CLAIM }) }), ME)).toEqual([CLAIM]);
  });

  it("never the bot's own: its inline card, or a forward of one of its messages", () => {
    expect(buttonLinks(ownCard(), ME)).toEqual([]);
    const forwarded = groupMessage("card", { forward_origin: { type: "user", date: 1, sender_user: BOT }, reply_markup: markup({ text: "Share", url: "https://t.me/share/url?url=x" }) });
    expect(buttonLinks(forwarded, ME)).toEqual([]);
    expect(buttonLinks(ownCard())).not.toEqual([]);
  });

  it("an inline bot's drainer button, or a forwarded post's Claim button, is a look-alike scam for a member", () => {
    const via = groupMessage("Claim your TONK reward below", { via_bot: PROMO, reply_markup: markup({ text: "Claim", url: "https://tonkfun-claim.xyz" }) });
    const origin = { type: "channel" as const, date: 1, chat: { id: -100777, type: "channel" as const, title: "Crypto Daily" } };
    const forward = groupMessage("Crypto Daily: rewards are live", { forward_origin: origin, reply_markup: markup({ text: "Claim", url: "https://tonkfun-claim.xyz/start" }) });
    for (const m of [via, forward]) {
      const rule = { ...input(m.text ?? "", { standing: "member", viaButtons: viaButtons(m, ME), forwarded: m.forward_origin !== undefined }), buttons: buttonLinks(m, ME) } as RuleInput;
      expect(checkMessage(rule).hits.find((h) => h.category === "lookalike")).toMatchObject({ severity: "scam", certain: true });
    }
  });

  it("a via_bot that isn't a user is none; another bot without a username still counts", () => {
    expect(viaButtons(groupMessage("hi", { via_bot: "x", reply_markup: markup({ text: "Claim", url: CLAIM }) } as unknown as Partial<TgMessage>), ME)).toBe(false);
    expect(viaButtons(groupMessage("hi", { via_bot: { ...PROMO, username: undefined }, reply_markup: markup({ text: "Claim", url: CLAIM }) }), ME)).toBe(true);
  });

  it("survives malformed markup, and keeps at most 50 targets of at most 2,048 characters", () => {
    for (const reply_markup of ["x", null, { inline_keyboard: "x" }, { inline_keyboard: [null, "x", [null, 7, { url: 7 }, { login_url: "x" }, { web_app: null }]] }]) {
      expect(buttonLinks(groupMessage("hi", { reply_markup } as unknown as Partial<TgMessage>), ME)).toEqual([]);
    }
    const many = Array.from({ length: 80 }, (_, i) => ({ text: `b${i}`, url: `https://evil${i}.xyz/${"a".repeat(3_000)}` }));
    const links = buttonLinks(groupMessage("hi", { reply_markup: markup(...many) }), ME);
    expect(links).toHaveLength(50);
    expect(links.every((l) => l.length === 2_048)).toBe(true);
  });
});

describe("what makes messages one for the flood limits (abuse#8)", () => {
  it("an album's id, and a forward's own date", () => {
    expect(burstOf(groupMessage("", { media_group_id: "13579" }))).toEqual({ album: "13579", forwardedAt: null });
    const forward = groupMessage("fwd", { date: 1_800_000_000, forward_origin: { type: "hidden_user", date: 1, sender_user_name: "Someone" } });
    expect(burstOf(forward)).toEqual({ album: null, forwardedAt: 1_800_000_000 });
    expect(burstOf(groupMessage("plain"))).toEqual({ album: null, forwardedAt: null });
  });

  it("ignores malformed album ids and dates", () => {
    for (const media_group_id of [7, "", "x".repeat(65), null]) {
      expect(burstOf(groupMessage("", { media_group_id } as unknown as Partial<TgMessage>)).album).toBeNull();
    }
    const odd = groupMessage("fwd", { date: Number.NaN, forward_origin: { type: "hidden_user", date: 1 } });
    expect(burstOf(odd).forwardedAt).toBeNull();
  });
});
