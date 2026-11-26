// @vitest-environment node
import { describe, expect, it } from "vitest";
import { en as communityEn } from "../src/telegram/i18n/community/en";
import { handleUpdate } from "../src/telegram/router";
import type { TgChat, TgChatMemberUpdated, TgMessage, TgUpdate } from "../src/telegram/types";
import { BOT_ID, GROUP, MEMBER } from "./community-fixtures";
import { ME } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { actingCalls, BOT_SELF, callbacks, context, spyHooks, WHOA } from "./telegram-fixtures";
import { ADMIN_CHAT, DATE, groupUpdates, liveCommunity, message, routed, settle } from "./telegram-fixtures-community";

const OTHER: TgChat = { id: -1_005_555_555_555, type: "supergroup", title: "Someone else's group" };

describe("the router and the community agent's groups", () => {
  it("hands a community group's messages to the agent first; 'pass' still answers /check, 'handled' stops there", async () => {
    const pass = routed({ routed: "pass" });
    const check = message(`/check@tonkfun_bot ${WHOA}`, GROUP);
    await handleUpdate(check, pass.ctx);
    expect(pass.spy.of("onMessage")).toEqual([[check.message, false]]);
    expect(pass.got.sent[0].view.text).toContain("<b>Whoa the Tarsier</b>");
    const handled = routed({ routed: "handled" });
    await handleUpdate(message(`/check@tonkfun_bot ${WHOA}`, GROUP), handled.ctx);
    await handleUpdate(message(undefined, GROUP, { photo: [{}] }), handled.ctx);
    expect(handled.spy.of("onMessage")).toHaveLength(2);
    expect(handled.got.sent).toHaveLength(0);
  });

  it("flags a stale message and passes it on, and module 14 stays quiet for it", async () => {
    const { ctx, got, spy } = routed({ routed: "pass" });
    const old = message(`/check@tonkfun_bot ${WHOA}`, GROUP, { date: DATE - 301 });
    await handleUpdate(old, ctx);
    expect(spy.of("onMessage")).toEqual([[old.message, true]]);
    expect(got.sent).toHaveLength(0);
  });

  it("hands the admin chat's messages to the agent, and a group's edits and member updates", async () => {
    const { ctx, spy } = routed();
    await handleUpdate(message("/status", ADMIN_CHAT), ctx);
    const u = groupUpdates(GROUP);
    await handleUpdate(u.edit, ctx);
    await handleUpdate(u.join, ctx);
    expect(actingCalls(spy.calls)).toEqual(["onMessage", "onEdited", "onMember"]);
  });

  it("passes the agent's own presses on, never a forged one", async () => {
    const { ctx, got, spy } = routed();
    const u = groupUpdates(GROUP);
    await handleUpdate(u.press, ctx);
    const forged = groupUpdates(GROUP).press;
    if (forged.callback_query?.message) forged.callback_query.message.reply_markup = { inline_keyboard: [[{ text: "Press", callback_data: "h:1:2" }]] };
    await handleUpdate(forged, ctx);
    expect(spy.of("onPress")).toEqual([[u.press.callback_query]]);
    expect(got.answers).toEqual([{ id: forged.callback_query?.id, text: undefined }]);
  });

  it("keeps every other group's messages, mentions, edits, member updates and presses away from the agent and the model", async () => {
    const live = liveCommunity();
    try {
      const spy = spyHooks(live.hooks);
      const { ctx, got } = context({}, NOW, { community: spy.hooks, me: () => ME, bot: () => "TonkfunBot" });
      for (const update of Object.values(groupUpdates(OTHER))) await handleUpdate(update, ctx);
      await settle();
      expect(actingCalls(spy.calls)).toEqual([]);
      expect(live.client.calls).toEqual([]);
      expect(got.sent).toEqual([]);
      // The same mention in the community group does reach the agent, and its answer the model.
      await handleUpdate(groupUpdates(GROUP).mention, ctx);
      await settle();
      expect(actingCalls(spy.calls)).toEqual(["onMessage"]);
      expect(live.client.calls.map((c) => c.kind)).toContain("answer");
    } finally {
      live.hooks.stop();
    }
  });

  it("never lets inline mode touch the agent", async () => {
    const { ctx, got, spy } = routed();
    await handleUpdate({ update_id: 1, inline_query: { id: "i1", from: MEMBER, query: `@TonkfunBot what is ${WHOA}?` } }, ctx);
    expect(spy.calls).toEqual([]);
    expect(got.inline).toHaveLength(1);
  });

  it("tells the agent where the bot was added, in any group but never a private chat; without the agent it logs only the group", async () => {
    const change = (chat: TgChat): TgUpdate => ({
      update_id: 2, my_chat_member: { chat, from: MEMBER, date: DATE, old_chat_member: { status: "left", user: { id: BOT_ID } }, new_chat_member: { status: "member", user: { id: BOT_ID } } },
    });
    const { ctx, spy } = routed();
    await handleUpdate(change(OTHER), ctx);
    await handleUpdate(change({ id: MEMBER.id, type: "private" }), ctx);
    expect(spy.of("onMyMember")).toEqual([[change(OTHER).my_chat_member as TgChatMemberUpdated]]);
    const logs: string[] = [];
    const off = context({}, NOW, { log: (line) => void logs.push(line) });
    await handleUpdate(change(OTHER), off.ctx);
    await handleUpdate(change({ id: MEMBER.id, type: "private" }), off.ctx);
    expect(logs).toEqual([`added to group ${OTHER.id} (supergroup)`]);
    expect(logs.join("\n")).not.toContain(String(MEMBER.id));
  });
});

describe("the router and private chats", () => {
  const ME_CHAT: TgChat = { id: MEMBER.id, type: "private" };
  const say = (text: string, extra: Partial<TgMessage> = {}) => message(text, ME_CHAT, extra);

  it("answers /ask at once, shows the Ask prompt for /ask alone, and asks a reply to that prompt", async () => {
    const { ctx, got, spy } = routed();
    const ask = say("/ask how do locks work?");
    await handleUpdate(ask, ctx);
    await handleUpdate(say("/ask"), ctx);
    const prompt: TgMessage = { message_id: 3, date: DATE, chat: ME_CHAT, from: { id: BOT_SELF.id, is_bot: true }, text: communityEn.answer.askPrompt };
    const reply = say("what does the Shield do?", { reply_to_message: prompt });
    await handleUpdate(reply, ctx);
    expect(spy.of("askPrivate")).toEqual([[ask.message, "how do locks work?"], [reply.message, "what does the Shield do?"]]);
    expect(got.sent).toHaveLength(1);
    expect(got.sent[0].view.text).toBe(communityEn.answer.askPrompt);
    expect(got.sent[0].view.forceReply?.force_reply).toBe(true);
  });

  it("doesn't show the Ask prompt while AI answers aren't offered, nor treat another bot's message as it", async () => {
    const { ctx, got } = routed({ ai: false });
    await handleUpdate(say("/ask"), ctx);
    expect(callbacks(got.sent[0].view)).not.toContain("askp");
    const on = routed();
    const forged: TgMessage = { message_id: 3, date: DATE, chat: ME_CHAT, from: { id: 999, is_bot: true }, text: communityEn.answer.askPrompt };
    await handleUpdate(say("what does the Shield do?", { reply_to_message: forged }), on.ctx);
    expect(on.spy.of("askPrivate")).toEqual([]);
    expect(on.spy.of("offerPrivate")).toHaveLength(1);
  });

  it("shares /report by choice, explains an empty one, and opens a review from /start appeal", async () => {
    const { ctx, got, spy } = routed();
    const report = say("/report someone DMed me pretending to be an admin");
    await handleUpdate(report, ctx);
    await handleUpdate(say("/report"), ctx);
    const appeal = say("/start appeal");
    await handleUpdate(appeal, ctx);
    expect(spy.of("reportPrivate")).toEqual([[report.message, "someone DMed me pretending to be an admin"], [expect.anything(), ""]]);
    expect(spy.of("startPrivate")).toEqual([[appeal.message, "appeal"]]);
    // In a private chat the text after /report is the report: the group's "reply to the message" line would be wrong here.
    expect(got.sent.map((s) => s.view.text)).toEqual([communityEn.report.usagePrivate]);
    expect(communityEn.report.usagePrivate).not.toBe(communityEn.report.usage);
  });

  it("tells a person their own ID with /id, with or without the agent", async () => {
    const { ctx, got } = routed();
    await handleUpdate(say("/id"), ctx);
    const off = context();
    await handleUpdate(say("/id"), off.ctx);
    expect(got.sent[0].view.text).toBe(`${communityEn.id.yours} <code>${MEMBER.id}</code>`);
    expect(off.got.sent[0].view.text).toBe(got.sent[0].view.text);
  });

  it("offers other text to the AI only while it's on, and keeps a bare address's card", async () => {
    const on = routed();
    const question = say("how is the protocol fee split on a curve trade?");
    await handleUpdate(question, on.ctx);
    await handleUpdate(say(WHOA), on.ctx);
    await handleUpdate(say(`CA: ${WHOA}`), on.ctx);
    const long = say(`is ${WHOA} safe? the dev sold a lot and I am worried`);
    await handleUpdate(long, on.ctx);
    expect(on.spy.of("offerPrivate")).toEqual([[question.message, question.message?.text], [long.message, long.message?.text]]);
    expect(on.got.sent.map((s) => s.view.text.split("\n")[0])).toEqual(["<b>Whoa the Tarsier</b> · WHOA", "<b>Whoa the Tarsier</b> · WHOA"]);
    const off = routed({ ai: false });
    await handleUpdate(say("how is the protocol fee split on a curve trade?"), off.ctx);
    await handleUpdate(say(`is ${WHOA} safe? the dev sold a lot and I am worried`), off.ctx);
    expect(off.spy.of("offerPrivate")).toEqual([]);
    expect(off.got.sent[0].view.text).toContain("That doesn't look like a token address.");
    expect(off.got.sent[1].view.text).toContain("<b>Whoa the Tarsier</b>");
  });

  it("opens the menus with Ask a question and the AI lines while AI answers are on", async () => {
    const { ctx, got } = routed();
    await handleUpdate(say("/start"), ctx);
    await handleUpdate(say("/help"), ctx);
    expect(callbacks(got.sent[0].view)[0]).toBe("askp");
    expect(got.sent[1].view.text).toContain(communityEn.help.ai);
  });
});
