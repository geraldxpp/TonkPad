import type { BotApi } from "../src/telegram/api";
import { createTelegramOut } from "../src/telegram/community/telegram-out";
import type { Records } from "../src/telegram/community/types";
import { Sender } from "../src/telegram/sender";
import { ADMIN_CHAT_ID, memoryRecords } from "./community-fixtures";

/** One request as it was written: params through JSON, so a getter is read at that moment, and the (fake) clock then. */
export interface ApiCall {
  method: string;
  params: Record<string, unknown>;
  at: number;
}

/** Throws for a request Telegram should refuse, or returns null to let it through. */
export type Refuse = (method: string, params: Record<string, unknown>) => Error | null;
/** Telegram's answer to a request, or undefined for the usual one. */
export type Answer = (method: string, params: Record<string, unknown>) => unknown;

/** What Telegram answers when all goes well; new messages are numbered from 701. */
function reply(method: string, p: Record<string, unknown>, nextId: () => number): unknown {
  switch (method) {
    case "sendMessage":
      return { message_id: nextId(), date: 0, chat: { id: p.chat_id, type: "supergroup" } };
    case "editMessageText":
      return { message_id: p.message_id, date: 0, chat: { id: p.chat_id, type: "supergroup" } };
    case "getChatMember":
      return { status: "member", user: { id: p.user_id, first_name: "Member" } };
    case "getChat":
      return { id: p.chat_id, type: "supergroup", title: "Group" };
    case "getChatAdministrators":
      return [{ status: "creator", user: { id: 7_001, first_name: "Owner" } }];
    case "getChatMemberCount":
      return 42;
    default:
      return true;
  }
}

/** A Bot API that records each request and answers it (as `answer` says, else as usual), or refuses it as `refuse` says. Nothing touches the network. */
export function fakeApi(refuse: Refuse = () => null, answer: Answer = () => undefined) {
  const calls: ApiCall[] = [];
  let id = 700;
  const api: BotApi = {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      const written = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
      calls.push({ method, params: written, at: Date.now() });
      const error = refuse(method, written);
      if (error) throw error;
      return (answer(method, written) ?? reply(method, written, () => (id += 1))) as T;
    },
  };
  const of = (method: string) => calls.filter((c) => c.method === method);
  return { api, calls, of };
}

/**
 * telegram-out over a real Sender and the fake API, on the test's clock
 * (Date.now, so vi.useFakeTimers moves it, and the Sender's sleeps too).
 * Every log line, the Sender's and telegram-out's, lands in `lines`.
 */
export function outBench(options: { refuse?: Refuse; answer?: Answer; records?: Records; adminReady?: () => boolean } = {}) {
  const tg = fakeApi(options.refuse, options.answer);
  const lines: string[] = [];
  const log = (line: string) => void lines.push(line);
  const sender = new Sender(tg.api, log, () => Date.now());
  const records = options.records ?? memoryRecords();
  const out = createTelegramOut({ sender, records, adminChat: ADMIN_CHAT_ID, adminReady: options.adminReady, log, now: () => Date.now() });
  return { ...tg, sender, records, out, lines };
}

/** The texts of the messages sent so far, in order. */
export const texts = (calls: readonly ApiCall[]) => calls.filter((c) => c.method === "sendMessage").map((c) => c.params.text);
