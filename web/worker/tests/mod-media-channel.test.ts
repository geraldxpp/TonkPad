// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fromChannel, type OfficialChannel } from "../src/telegram/mod/media";
import type { TgMessage, TgMessageOrigin } from "../src/telegram/types";
import { BOT, groupMessage } from "./community-fixtures";

/**
 * A forward from the official channel (mod/media.ts fromChannel), whose
 * posts are the bot's own: its channel post, or a message it sent in a
 * group as itself, matched by the chat ID TELEGRAM_CHANNEL_ID gives
 * (community/index-setup.ts readChannel), and by its username only when it
 * gives none, since a username can pass to another chat.
 */

const ID = -1_001_555_000_111;
const OTHER = -1_001_999_000_222;
const BY_ID: OfficialChannel = { id: ID, username: "tonkfun_launches" };
const BY_NAME: OfficialChannel = { id: null, username: "tonkfun_launches" };
const chatOf = (id: number, username?: string) => ({ id, type: "channel" as const, title: "Tonkfun Launches", ...(username ? { username } : {}) });
/** The channel's own post, forwarded. */
const post = (id: number, username?: string): TgMessageOrigin => ({ type: "channel", date: 1, chat: chatOf(id, username) });
/** A message the channel sent in a group as itself, forwarded. */
const asChat = (id: number, username?: string): TgMessageOrigin => ({ type: "chat", date: 1, sender_chat: chatOf(id, username) });
const forward = (origin: unknown): TgMessage => groupMessage("New launch: Whoa the Tarsier", { forward_origin: origin as TgMessageOrigin });

describe("a forward from the official channel (media.ts fromChannel)", () => {
  it("is its post, or a message it sent in a group as itself, known by the chat ID, whatever its username is now", () => {
    for (const origin of [post(ID, "tonkfun_launches"), post(ID), post(ID, "renamed_since"), asChat(ID), asChat(ID, "tonkfun_launches")]) {
      expect(fromChannel(forward(origin), BY_ID)).toBe(true);
    }
  });

  it("is never another chat by the channel's username once its ID is known", () => {
    expect(fromChannel(forward(post(OTHER, "tonkfun_launches")), BY_ID)).toBe(false);
    expect(fromChannel(forward(asChat(OTHER, "tonkfun_launches")), BY_ID)).toBe(false);
  });

  it("is known by its username, in any case, only when TELEGRAM_CHANNEL_ID gives a username alone", () => {
    expect(fromChannel(forward(post(OTHER, "TonkFun_Launches")), BY_NAME)).toBe(true);
    expect(fromChannel(forward(asChat(OTHER, "tonkfun_launches")), BY_NAME)).toBe(true);
    expect(fromChannel(forward(post(OTHER, "tonkfun_launches_official")), BY_NAME)).toBe(false);
    expect(fromChannel(forward(post(OTHER)), BY_NAME)).toBe(false);
  });

  it("is nothing without the channel, nor any user's, hidden user's or malformed forward", () => {
    for (const channel of [null, undefined, { id: null, username: null }, { id: null, username: "" }]) expect(fromChannel(forward(post(ID, "tonkfun_launches")), channel)).toBe(false);
    expect(fromChannel(groupMessage("New launch"), BY_ID)).toBe(false);
    const others: unknown[] = [
      { type: "user", date: 1, sender_user: { ...BOT, id: ID, username: "tonkfun_launches" } },
      { type: "hidden_user", date: 1, sender_user_name: "tonkfun_launches" },
      { type: "channel", date: 1, chat: null },
      { type: "channel", date: 1, chat: { id: String(ID), username: "x" } },
      { type: "chat", date: 1, chat: chatOf(ID, "tonkfun_launches") },
      { type: "channel", date: 1 },
      "channel",
      null,
    ];
    for (const origin of others) {
      for (const channel of [BY_ID, BY_NAME]) expect(fromChannel(forward(origin), channel), JSON.stringify(origin)).toBe(false);
    }
  });
});
