// @vitest-environment node
import { describe, expect, it } from "vitest";
import { en as communityEn } from "../src/telegram/i18n/community/en";
import { handleUpdate } from "../src/telegram/router";
import type { TgChat, TgMessage, TgUpdate } from "../src/telegram/types";
import { GROUP, MEMBER } from "./community-fixtures";
import { BOT_SELF, callbacks, context, WHOA } from "./telegram-fixtures";
import { DATE, message, routed } from "./telegram-fixtures-community";

/**
 * Presses that post a new message (a card, the launches list under an AI
 * answer): in a group once per message and button, so nobody can make the
 * bot flood it, and never a prompt only a private chat would read.
 */

let nextId = 70_000;

describe("presses that post a new message in a group", () => {
  /** A press on one of the bot's messages: an AI answer (`label` first) or a launches list, showing that button. */
  const pressOn = (chat: TgChat, data: string, first: string, extra: Partial<TgMessage> = {}): TgUpdate => {
    nextId += 1;
    const text = `${first}\nOn launches: the newest are in the bot's list.\n\n${communityEn.answer.footer}`;
    const shown: TgMessage = { message_id: 400, date: DATE, chat, from: { id: BOT_SELF.id, is_bot: true }, text, reply_markup: { inline_keyboard: [[{ text: "Button", callback_data: data }]] }, ...extra };
    return { update_id: nextId, callback_query: { id: `cb${nextId}`, from: MEMBER, data, message: shown } };
  };
  const TOPIC = { is_topic_message: true, message_thread_id: 12 };

  it("opens the launches list under an AI answer in its topic, once per answer in a group, and leaves the answer as it is", async () => {
    const { ctx, got } = context();
    for (let i = 0; i < 2; i++) await handleUpdate(pressOn(GROUP, "l:tonk", communityEn.answer.label, TOPIC), ctx);
    expect(got.edits).toEqual([]);
    expect(got.answers).toHaveLength(2);
    expect(got.sent).toHaveLength(1);
    expect(got.sent[0]).toMatchObject({ replyTo: 400, thread: 12 });
    expect(got.sent[0].view.text.split("\n")[0]).toBe("<b>Latest on tonkfun.fun</b>");
    const dm = context();
    for (let i = 0; i < 2; i++) await handleUpdate(pressOn({ id: MEMBER.id, type: "private" }, "l:tonk", communityEn.answer.label), dm.ctx);
    expect(dm.got.sent).toHaveLength(2);
    expect(dm.got.edits).toEqual([]);
  });

  it("still switches a list's own tabs in place", async () => {
    const { ctx, got } = context();
    await handleUpdate(pressOn(GROUP, "l:pump", "Latest on tonkfun.fun"), ctx);
    expect(got.sent).toEqual([]);
    expect(got.edits[0].view.text.split("\n")[0]).toBe("<b>Latest on Pump.fun</b>");
  });

  it("posts a token's card from a list once per button in a group, in its topic, and no prompt there", async () => {
    const { ctx, got } = context();
    for (const data of [`c:${WHOA}`, `c:${WHOA}`, "check", "ref"]) await handleUpdate(pressOn(GROUP, data, "Latest on tonkfun.fun", TOPIC), ctx);
    expect(got.sent).toHaveLength(1);
    expect(got.sent[0].thread).toBe(12);
    expect(got.sent[0].view.text).toContain("<b>Whoa the Tarsier</b>");
  });

  it("keeps the Ask button out of a menu many people read", async () => {
    const { ctx, got } = routed();
    await handleUpdate(pressOn(GROUP, "home", "Latest on tonkfun.fun"), ctx);
    await handleUpdate(pressOn({ id: MEMBER.id, type: "private" }, "home", "Latest on tonkfun.fun"), ctx);
    expect(callbacks(got.edits[0].view)).not.toContain("askp");
    expect(callbacks(got.edits[1].view)[0]).toBe("askp");
  });

  it("replies to a /check in a forum topic inside that topic", async () => {
    const { ctx, got } = context();
    await handleUpdate(message(`/check@tonkfun_bot ${WHOA}`, GROUP, TOPIC), ctx);
    expect(got.sent[0].thread).toBe(12);
  });
});
