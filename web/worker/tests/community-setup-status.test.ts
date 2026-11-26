import { describe, expect, it } from "vitest";
import { type BotApi, TelegramError } from "../src/telegram/api";
import { checkSetup } from "../src/telegram/community/setup";
import { watchFailures } from "../src/telegram/community/setup-status";
import type { TgChatMember } from "../src/telegram/types";
import { ADMIN_CHAT_ID, BOT_ID, GROUP_ID, OWNER_ID, recordOut } from "./community-fixtures";
import { bench, READY, SECOND_GROUP, WEEK_S } from "./community-setup-fixtures";

/**
 * Setup reads that see what Telegram answers (wiring#2): a 4xx other than
 * 429 is certain, so an admin chat Telegram refuses turns community mode off
 * at once, and a group the bot isn't in any more is dropped with its records
 * (newcomers#7); a network error, a 429 or a 5xx stays unsure.
 */

const notFound = () => new TelegramError(400, "Bad Request: chat not found", null);
const upgraded = () => new TelegramError(400, "Bad Request: group chat was upgraded to a supergroup chat", null);
const forbidden = () => new TelegramError(403, "Forbidden: bot was kicked from the supergroup chat", null);
const badGateway = () => new TelegramError(502, "Bad Gateway", null);
const tooMany = () => new TelegramError(429, "Too Many Requests: retry after 1", 1);
const unreachable = () => new TelegramError(0, "", null);

/** Each read's key: method, chat and person. */
const keyOf = (method: string, params: Record<string, unknown>) => `${method}:${String(params.chat_id)}:${params.user_id === undefined ? "" : String(params.user_id)}`;

/**
 * The setup bench over a fake Bot API under the failure watch, its reads
 * caught the way the Sender catches them (a failure is null): `fail` makes
 * a read throw, keyed "<method>:<chat>[:<user>]"; everything else is READY.
 */
function telegramBench(fail: Record<string, () => TelegramError>, places: Record<number, Record<number, Partial<TgChatMember>>> = READY as Record<number, Record<number, Partial<TgChatMember>>>) {
  const calls: string[] = [];
  const base: BotApi = {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      const key = keyOf(method, params);
      calls.push(key);
      const failing = fail[key];
      if (failing) throw failing();
      const chat = Number(params.chat_id);
      if (method === "getChat") return { id: chat, type: "supergroup", title: chat === ADMIN_CHAT_ID ? "Team" : "tonkfun.fun community", ...(chat === ADMIN_CHAT_ID ? { message_auto_delete_time: WEEK_S } : {}) } as T;
      const user = Number(params.user_id);
      return { status: "member", user: { id: user }, ...places[chat]?.[user] } as T;
    },
  };
  const { api, watch } = watchFailures(base);
  const out = recordOut({
    chat: (chat) => api.call<never>("getChat", { chat_id: chat }).catch(() => null),
    member: (chat, user) => api.call<TgChatMember>("getChatMember", { chat_id: chat, user_id: user }).catch(() => null),
  });
  const b = bench(READY, { extra: { out, failures: watch } });
  return { ...b, calls };
}

describe("watchFailures", () => {
  it("hands a read back what Telegram answered when it failed: certain for a 4xx, unsure for a 429, a 5xx or no answer", async () => {
    for (const [error, definite] of [[notFound, true], [forbidden, true], [badGateway, false], [tooMany, false], [unreachable, false]] as const) {
      const { api, watch } = watchFailures({ call: () => Promise.reject(error()) });
      const got = await watch.read("getChat", ADMIN_CHAT_ID, null, () => api.call<object>("getChat", { chat_id: ADMIN_CHAT_ID }).catch(() => null));
      expect(got.value).toBeNull();
      expect(got.failure?.definite).toBe(definite);
      expect(got.failure?.status).toBe(error().status);
    }
  });

  it("keeps nothing outside a read, and never mixes up two reads or another call's failure", async () => {
    let failing = true;
    const { api, watch } = watchFailures({ call: async <T>(method: string) => {
      if (failing || method === "sendMessage") throw notFound();
      return { id: GROUP_ID } as T;
    } });
    // A failure no read watches is just passed on.
    await expect(api.call("sendMessage", { chat_id: ADMIN_CHAT_ID })).rejects.toBeInstanceOf(TelegramError);
    const member = await watch.read("getChatMember", GROUP_ID, OWNER_ID, async () => {
      await api.call("sendMessage", { chat_id: GROUP_ID }).catch(() => null);
      return null;
    });
    expect(member.failure).toBeNull();
    failing = false;
    const chat = await watch.read("getChat", GROUP_ID, null, () => api.call<object>("getChat", { chat_id: GROUP_ID }).catch(() => null));
    expect(chat).toEqual({ value: { id: GROUP_ID }, failure: null });
  });
});

describe("setup reads that see Telegram's answer (wiring#2)", () => {
  it("turns community mode off at once when Telegram can't find the admin chat, with a clear log line and no retries", async () => {
    const { deps, alerts, waits, calls } = telegramBench({ [`getChat:${ADMIN_CHAT_ID}:`]: notFound });
    const result = await checkSetup(deps);
    expect(result.adminChat).toBe("off");
    expect(result.adminChatOk).toBe(false);
    expect(result.chats).toEqual([]);
    expect(result.notes.join("\n")).toContain("community mode off: the admin chat can't be reached (Telegram says 400: Bad Request: chat not found)");
    expect(result.notes.join("\n")).toContain("TELEGRAM_ADMIN_CHAT_ID");
    expect(calls.filter((c) => c === `getChat:${ADMIN_CHAT_ID}:`)).toHaveLength(1);
    expect(waits).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("says an admin chat upgraded to a supergroup has a new ID to set, and that a 403 means the bot isn't in it", async () => {
    const moved = await checkSetup(telegramBench({ [`getChat:${ADMIN_CHAT_ID}:`]: upgraded }).deps);
    expect(moved.adminChat).toBe("off");
    expect(moved.notes.join("\n")).toContain("upgraded to a supergroup and has a new ID");
    expect(moved.notes.join("\n")).toContain("set TELEGRAM_ADMIN_CHAT_ID to the new -100… ID");
    const kicked = await checkSetup(telegramBench({ [`getChat:${ADMIN_CHAT_ID}:`]: forbidden }).deps);
    expect(kicked.adminChat).toBe("off");
    expect(kicked.notes.join("\n")).toContain("Telegram says 403");
  });

  it("stays unsure, trying again, when Telegram doesn't answer: a 502, a 429 or no connection", async () => {
    for (const error of [badGateway, tooMany, unreachable]) {
      const { deps, waits } = telegramBench({ [`getChat:${ADMIN_CHAT_ID}:`]: error });
      const result = await checkSetup(deps);
      expect(result.adminChat).toBe("unsure");
      expect(result.adminChatOk).toBe(true);
      expect(result.chats).toEqual([GROUP_ID, SECOND_GROUP]);
      expect(waits).toEqual([1_000, 2_000]);
    }
  });

  it("turns the admin chat off when Telegram says for certain that no owner is in it", async () => {
    const result = await checkSetup(telegramBench({ [`getChatMember:${ADMIN_CHAT_ID}:${OWNER_ID}`]: () => new TelegramError(400, "Bad Request: user not found", null) }).deps);
    expect(result.adminChat).toBe("off");
    expect(result.notes).toContain("no owner (TELEGRAM_OWNER_IDS) is a member of the admin chat");
  });
});

describe("a group the bot isn't in any more (newcomers#7)", () => {
  it("is dropped as gone when the bot left or was removed, or Telegram refuses the group for certain; its alert says it lacks its rights", async () => {
    const kicked = telegramBench({}, { ...READY, [SECOND_GROUP]: { ...READY[SECOND_GROUP], [BOT_ID]: { status: "kicked" } } } as Record<number, Record<number, Partial<TgChatMember>>>);
    const result = await checkSetup(kicked.deps);
    expect(result.chats).toEqual([GROUP_ID]);
    expect(result.gone).toEqual([SECOND_GROUP]);
    expect(result.notes.join("\n")).toContain(`community group ${SECOND_GROUP} dropped: the bot isn't in it any more`);
    expect(kicked.alerts).toEqual([expect.objectContaining({ chat: SECOND_GROUP, kind: "rights" })]);
    const refused = await checkSetup(telegramBench({ [`getChatMember:${GROUP_ID}:${BOT_ID}`]: forbidden }).deps);
    expect(refused.gone).toEqual([GROUP_ID]);
    expect(refused.chats).toEqual([SECOND_GROUP]);
  });

  it("keeps a group whose rights are only missing (its records stay), and one Telegram can't read yet", async () => {
    const rights = telegramBench({}, { ...READY, [GROUP_ID]: { ...READY[GROUP_ID], [BOT_ID]: { status: "administrator", can_delete_messages: true } } } as Record<number, Record<number, Partial<TgChatMember>>>);
    const result = await checkSetup(rights.deps);
    expect(result.chats).toEqual([SECOND_GROUP]);
    expect(result.gone).toEqual([]);
    const down = await checkSetup(telegramBench({ [`getChatMember:${GROUP_ID}:${BOT_ID}`]: badGateway }).deps);
    expect(down.chats).toEqual([GROUP_ID, SECOND_GROUP]);
    expect(down.unsure).toEqual([GROUP_ID]);
    expect(down.gone).toEqual([]);
  });
});
