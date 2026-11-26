// @vitest-environment node
import { describe, expect, it } from "vitest";
import { en } from "../src/telegram/i18n/en";
import { en as communityEn } from "../src/telegram/i18n/community/en";
import { handleUpdate } from "../src/telegram/router";
import type { TgChat, TgUpdate } from "../src/telegram/types";
import { GROUP } from "./community-fixtures";
import { NOW } from "./fixtures";
import { context, stubHooks, urls } from "./telegram-fixtures";
import { ADMIN_CHAT, message } from "./telegram-fixtures-community";

/** Any group the community agent doesn't run gets module 14's /help, exactly (wiring#6). */

const OTHER: TgChat = { id: -1005555555555, type: "supergroup", title: "Another group" };
const PRIVATE: TgChat = { id: 101, type: "private" };

function bot(o: { ai?: boolean; groupAi?: boolean } = {}) {
  const hooks = stubHooks({ groups: [GROUP.id], adminChat: ADMIN_CHAT.id, routed: "pass", ai: o.ai ?? true });
  return context({}, NOW, { community: { ...hooks, groupAi: () => o.groupAi ?? true } });
}

/** A press on module 14's Help button in `chat`, on a message that holds it. */
const helpPress = (chat: TgChat): TgUpdate => ({
  update_id: 9_001,
  callback_query: {
    id: "q-help", from: { id: 101, language_code: "en" }, data: "help",
    message: { message_id: 700, date: Math.floor(NOW / 1000), chat, text: "menu", reply_markup: { inline_keyboard: [[{ text: "Help", callback_data: "help" }]] } },
  },
});

describe("/help outside the community agent's groups", () => {
  it("is module 14's in an unrelated group: no AI lines and no Privacy button, with AI on in the community groups", async () => {
    const { ctx, got } = bot();
    await handleUpdate(message("/help", OTHER), ctx);
    const view = got.sent[0].view;
    expect(view.text).not.toContain(communityEn.help.ai);
    expect(view.text).not.toContain(communityEn.help.groupAsk);
    expect(view.keyboard?.inline_keyboard.flat().map((b) => b.text)).toEqual([en.home.open]);
  });

  it("is the same as without any community agent there", async () => {
    const withAgent = bot();
    await handleUpdate(message("/help", OTHER), withAgent.ctx);
    const without = context({}, NOW);
    await handleUpdate(message("/help", OTHER), without.ctx);
    expect(withAgent.got.sent[0].view).toEqual(without.got.sent[0].view);
  });

  it("keeps the AI lines and the Privacy button in the agent's own group and the admin chat", async () => {
    for (const chat of [GROUP, ADMIN_CHAT]) {
      const { ctx, got } = bot();
      await handleUpdate(message("/help", chat), ctx);
      expect(got.sent[0].view.text, String(chat.id)).toContain(communityEn.help.ai);
      expect(urls(got.sent[0].view).some((u) => u.includes("/privacy/telegram"))).toBe(true);
    }
  });

  it("leaves the AI lines out of the Help button's menu in an unrelated group too", async () => {
    const { ctx, got } = bot();
    await handleUpdate(helpPress(OTHER), ctx);
    expect(got.edits[0].view.text).not.toContain(communityEn.help.ai);
    expect(urls(got.edits[0].view).some((u) => u.includes("/privacy/telegram"))).toBe(false);
  });
});

describe("a private /report once community mode is off (wiring#5)", () => {
  const off = () => {
    const hooks = stubHooks({ groups: [], adminChat: null });
    // As after a runtime turn-off: the agent takes no report, whatever it says.
    return context({}, NOW, { community: { ...hooks, reportPrivate: async () => false } });
  };

  it("answers words it couldn't share with the Security page's contact, never the usage text", async () => {
    const { ctx, got } = off();
    await handleUpdate(message("/report someone DMed me asking for my seed", PRIVATE), ctx);
    expect(got.sent.map((s) => s.view.text)).toEqual([communityEn.report.noAdminChat]);
  });

  it("still explains /report alone", async () => {
    const { ctx, got } = off();
    await handleUpdate(message("/report", PRIVATE), ctx);
    expect(got.sent.map((s) => s.view.text)).toEqual([communityEn.report.usagePrivate]);
  });
});
