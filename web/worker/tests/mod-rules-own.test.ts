// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inlineArticle } from "../src/telegram/inline";
import { ownCard } from "../src/telegram/mod/media";
import type { RuleInput } from "../src/telegram/mod/rules";
import { botsOwnOf, raidKeysOf } from "../src/telegram/mod/rules-scan";
import { shouldTriage } from "../src/telegram/mod/triage";
import type { TgMessage } from "../src/telegram/types";
import { BOT, BOT_ID, groupMessage } from "./community-fixtures";
import { check, WHOA } from "./mod-rules-fixtures";
import { SITE, token } from "./telegram-fixtures";

/**
 * Words a member posts or passes on but didn't write (mod/media.ts ownCard,
 * mod/rules-scan.ts botsOwnOf), their author known by ID: the bot's token
 * card through inline mode, known by the bot's ID and the card's Refresh
 * button, a user forward from the bot (forwardSelf) or an admin
 * (forwardAdmin), and a forward of the official channel's post
 * (forwardChannel). They never go to Haiku's check, whoever posts them and
 * whatever they hold, and never feed a link raid, though the rules still
 * read their links. A forward vouched for by username alone is the
 * member's to judge.
 */

const ME = { id: BOT_ID };
/** Another account holding the bot's username (say, one the bot dropped): not the bot. */
const LOOKALIKE = { ...BOT, id: 4_242 };
const NO = { raid: false, removedLink: false };
const KAI = { id: 202, is_bot: false, first_name: "Kai" };

/** The card as Telegram delivers what inline mode posted: its text, via the bot, with its buttons. */
function card(extra: Partial<TgMessage> = {}): TgMessage {
  const article = inlineArticle(token(), "en", SITE);
  return groupMessage(article.input_message_content.message_text.replace(/<[^>]+>/g, ""), { via_bot: BOT, reply_markup: article.reply_markup, ...extra });
}

describe("the bot's own card (media.ts ownCard)", () => {
  it("is via the bot, known by its ID alone, with the card's Refresh button", () => {
    expect(ownCard(card(), ME)).toBe(true);
    // Passed on, it keeps via_bot and its buttons: still the bot's card.
    expect(ownCard(card({ forward_origin: { type: "user", date: 1, sender_user: KAI } }), ME)).toBe(true);
    expect(ownCard(card({ via_bot: LOOKALIKE }), ME)).toBe(false);
    expect(ownCard(card({ via_bot: undefined }), ME)).toBe(false);
    expect(ownCard(card(), null)).toBe(false);
    expect(ownCard(card())).toBe(false);
  });

  it("is nothing else the bot's inline mode posts: no buttons, or buttons without the card's Refresh", () => {
    expect(ownCard(groupMessage("how do creator locks work?", { via_bot: BOT }), ME)).toBe(false);
    expect(ownCard(groupMessage("Open", { via_bot: BOT, reply_markup: { inline_keyboard: [[{ text: "Open", url: SITE }]] } }), ME)).toBe(false);
    expect(ownCard(groupMessage("Ask", { via_bot: BOT, reply_markup: { inline_keyboard: [[{ text: "Ask", callback_data: "a:1" }]] } }), ME)).toBe(false);
  });

  it("survives malformed markup", () => {
    for (const reply_markup of ["x", null, { inline_keyboard: "x" }, { inline_keyboard: [null, "r:", [null, 7, { callback_data: 7 }, { url: "r:en:x" }]] }]) {
      expect(ownCard(groupMessage("x", { via_bot: BOT, reply_markup } as unknown as Partial<TgMessage>), ME)).toBe(false);
    }
  });
});

describe("words the member didn't write, in the rules (rules-scan.ts botsOwnOf)", () => {
  const OWN: Array<[string, Partial<RuleInput>]> = [
    ["the bot's card", { ownCard: true }],
    ["a forward of the bot's message", { forwarded: true, forwardName: "TonkFun", forwardUsername: "tonkfunbot", forwardSelf: true }],
    ["a forward of the official channel's post", { forwarded: true, forwardName: "Tonkfun Launches", forwardUsername: "tonkfun_launches", forwardChannel: true }],
    ["a forward of an admin's message, by the admin's ID", { forwarded: true, forwardName: "Alex Admin", forwardAdmin: true }],
  ];

  it("are marked, and nothing else is: a forward vouched for by username alone is the member's to judge", () => {
    for (const [label, extra] of OWN) expect(botsOwnOf(check("gm", extra).markers), label).toBe(true);
    expect(botsOwnOf(check("gm").markers)).toBe(false);
    for (const [forwardName, forwardUsername] of [["Alex Admin", "alex_admin"], ["Tonkfun Launches", "tonkfun_launches"], ["Tonkfun Chat", "tonkfun_chat"]]) {
      expect(botsOwnOf(check("gm", { forwarded: true, forwardName, forwardUsername }).markers), forwardUsername).toBe(false);
    }
    expect(botsOwnOf(check("gm", { forwarded: true, forwardName: "TonkFun", forwardUsername: "tonkfunbot", forwardSelf: false }).markers)).toBe(false);
  });

  it("keep the hits of what they say, which a decision reads as not the member's: an admin's warning names a look-alike", () => {
    const admin = OWN[3][1];
    expect(check("Our only site is tonkfun.fun. Ignore tonkfun-airdrop.com", { standing: "new", ...admin }).hits.map((h) => [h.category, h.certain])).toContainEqual(["lookalike", true]);
    expect(check("Message me for support", { standing: "new", ...admin }).hits.map((h) => h.category)).toContain("fake_support");
  });

  it("never go to Haiku's check, from a new member, a member or a trusted one, whatever they hold", () => {
    const texts = [`Whoa the Tarsier · WHOA\n${WHOA}`, "is it locked? ask @kai_trades", "claim free eth dot site", "hello there everyone, how are you all doing", "someone DMed me about my wallet"];
    for (const [label, extra] of OWN) {
      for (const standing of ["new", "member", "trusted"] as const) {
        for (const text of texts) {
          const result = check(text, { standing, ...extra });
          expect(shouldTriage(result, standing, NO), `${label}, ${standing}: ${text}`).toBe(false);
          expect(shouldTriage(result, standing, { raid: false, removedLink: true }), `${label}, ${standing}, removed: ${text}`).toBe(false);
        }
      }
    }
    // The same words as the member's own still go.
    expect(shouldTriage(check(`Whoa the Tarsier · WHOA\n${WHOA}`), "member", NO)).toBe(true);
    expect(shouldTriage(check("hello there everyone, how are you all doing", { standing: "new" }), "new", NO)).toBe(true);
  });

  it("never feed a link raid: no raid keys, though their links are read as ever", () => {
    for (const [label, extra] of OWN) {
      const result = check("airdrop dot xyz", extra);
      expect(raidKeysOf(result.markers), label).toEqual([]);
      expect(result.hits.map((h) => h.category).sort(), label).toEqual(["phishing", "unknown_link"]);
    }
    expect(raidKeysOf(check("airdrop dot xyz").markers)).not.toEqual([]);
  });
});
