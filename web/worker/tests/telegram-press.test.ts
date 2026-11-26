import { describe, expect, it } from "vitest";
import { COMMUNITY_PRESSES, isCommunityPress, pressMatches, updateChat } from "../src/telegram/press";
import type { InlineKeyboard, TgCallbackQuery, TgChatMemberUpdated, TgMessage, TgUpdate } from "../src/telegram/types";
import { GROUP, GROUP_ID, groupMessage, MEMBER, pressOn } from "./community-fixtures";
import { NOW } from "./fixtures";

const keyboard = (...data: string[]): InlineKeyboard => ({ inline_keyboard: [data.map((d) => ({ text: d, callback_data: d }))] });
const withMarkup = (q: TgCallbackQuery, markup: unknown): TgCallbackQuery => ({ ...q, message: { ...(q.message as TgMessage), reply_markup: markup as InlineKeyboard } });

describe("pressMatches", () => {
  it("passes a press whose message still holds that button", () => {
    expect(pressMatches(pressOn("x:b:-1001234567890:101"))).toBe(true);
    const q = withMarkup(pressOn("h:7"), { inline_keyboard: [[{ text: "1", callback_data: "h:1" }], [{ text: "Docs", url: "https://www.tonkfun.fun/docs" }, { text: "7", callback_data: "h:7" }]] });
    expect(pressMatches(q)).toBe(true);
  });

  it("fails a forged data string on a real message", () => {
    expect(pressMatches({ ...pressOn("x:u:-1001234567890:101"), data: "x:b:-1001234567890:101" })).toBe(false);
    expect(pressMatches({ ...pressOn("h:7"), data: "h:7 " })).toBe(false);
    expect(pressMatches(withMarkup(pressOn("a:12"), keyboard("a:13", "askp")))).toBe(false);
  });

  it("passes an inline press, which carries no message", () => {
    expect(pressMatches({ id: "q1", from: MEMBER, data: "r:en:0xabc", inline_message_id: "AAQ" })).toBe(true);
  });

  it("fails a press on a message without buttons, as an old one comes back", () => {
    const old: TgMessage = { message_id: 3, date: 0, chat: GROUP };
    expect(pressMatches({ id: "q2", from: MEMBER, data: "h:1", message: old })).toBe(false);
    expect(pressMatches(withMarkup(pressOn("h:1"), undefined))).toBe(false);
  });

  it("fails a press without data, even beside link buttons that have none", () => {
    const q = withMarkup(pressOn("h:1"), { inline_keyboard: [[{ text: "Site", url: "https://www.tonkfun.fun" }]] });
    expect(pressMatches({ ...q, data: undefined })).toBe(false);
    expect(pressMatches({ ...pressOn("h:1"), data: "" })).toBe(false);
  });

  it("never throws on a malformed keyboard", () => {
    for (const markup of [{ inline_keyboard: "h:1" }, { inline_keyboard: [null, "h:1", [null, 5, { callback_data: 5 }]] }, { inline_keyboard: [[{ text: "x" }]] }, null, 7]) {
      expect(pressMatches(withMarkup(pressOn("h:1"), markup))).toBe(false);
    }
  });
});

describe("community presses", () => {
  it("recognises each community prefix and the Ask prompt", () => {
    for (const data of ["h:1", "x:b:-1001234567890:101", "p:-1001234567890", "a:55", "s:56", "ap:-1001234567890", "askp"]) expect(isCommunityPress(data), data).toBe(true);
    expect(COMMUNITY_PRESSES).toHaveLength(7);
  });

  it("leaves module 14's own buttons alone", () => {
    for (const data of ["r:en:0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95", "l:tonk", "c:0xabc", "home", "help", "check", "ref", "askpx", "", undefined]) expect(isCommunityPress(data), String(data)).toBe(false);
  });
});

describe("updateChat", () => {
  const member = (chatId: number): TgChatMemberUpdated => ({
    chat: { id: chatId, type: "supergroup" },
    from: MEMBER,
    date: Math.floor(NOW / 1000),
    old_chat_member: { status: "left", user: MEMBER },
    new_chat_member: { status: "member", user: MEMBER },
  });

  it("finds the chat of every update kind that has one", () => {
    expect(updateChat({ update_id: 1, message: groupMessage("hello") })).toBe(GROUP_ID);
    expect(updateChat({ update_id: 2, edited_message: groupMessage("hello again", { edit_date: Math.floor(NOW / 1000) }) })).toBe(GROUP_ID);
    expect(updateChat({ update_id: 3, callback_query: pressOn("h:1") })).toBe(GROUP_ID);
    expect(updateChat({ update_id: 4, chat_member: member(-1005555555555) })).toBe(-1005555555555);
    expect(updateChat({ update_id: 5, my_chat_member: member(-1006666666666) })).toBe(-1006666666666);
  });

  it("is null for inline queries, inline presses and malformed chats", () => {
    expect(updateChat({ update_id: 6, inline_query: { id: "i", from: MEMBER, query: "0xabc" } })).toBeNull();
    expect(updateChat({ update_id: 7, callback_query: { id: "q", from: MEMBER, data: "r:en:0xabc", inline_message_id: "AAQ" } })).toBeNull();
    expect(updateChat({ update_id: 8 })).toBeNull();
    const broken = { update_id: 9, message: { message_id: 1, date: 0, chat: { id: "-100123", type: "supergroup" } } } as unknown as TgUpdate;
    expect(updateChat(broken)).toBeNull();
  });
});
