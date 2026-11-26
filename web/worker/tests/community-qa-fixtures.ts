import type { ClaudeClient, ClaudeOutcome, ClaudeRequest } from "../src/telegram/claude/types";
import type { TgCallbackQuery, TgMessage, TgUser } from "../src/telegram/types";
import { BOT, claudeMessage, ok } from "./community-fixtures";
import { NOW } from "./fixtures";
import { type harness, person, verdict } from "./community-pipeline-fixtures";

/** Helpers for the Q&A flow's tests (community-qa*.test.ts): a private chat's messages and presses, and a client that holds answers. */

export const ASKER: TgUser = person(801, { username: "sam_doe" });
let serial = 100;

/** A message in the asker's private chat with the bot. */
export function dm(text: string, from: TgUser = ASKER): TgMessage {
  serial += 1;
  return { message_id: serial, date: Math.floor(NOW / 1000), chat: { id: from.id, type: "private" }, from, text };
}

/** A press in the asker's private chat, on a bot message that really holds the button. */
export function press(data: string, from: TgUser = ASKER): TgCallbackQuery {
  serial += 1;
  const message: TgMessage = { message_id: serial, date: Math.floor(NOW / 1000), chat: { id: from.id, type: "private" }, from: BOT, text: "…", reply_markup: { inline_keyboard: [[{ text: "Press", callback_data: data }]] } };
  return { id: `q${serial}`, from, data, message };
}

/** A client whose answers wait until the test releases them, in order; Haiku's check of a group question passes at once. */
export function held(): { client: ClaudeClient; calls: ClaudeRequest[]; release(outcome: ClaudeOutcome): void } {
  const calls: ClaudeRequest[] = [];
  const waiting: Array<(o: ClaudeOutcome) => void> = [];
  const create = (request: ClaudeRequest): Promise<ClaudeOutcome> => {
    if (request.kind === "triage") return Promise.resolve(verdict());
    calls.push(request);
    return new Promise<ClaudeOutcome>((resolve) => waiting.push(resolve));
  };
  return { calls, client: { create, countTokens: async () => null }, release: (outcome) => waiting.shift()?.(outcome) };
}

/** The answer requests a harness sent (a group question is checked first). */
export const answerCalls = (calls: readonly ClaudeRequest[]) => calls.filter((c) => c.kind === "answer");
export const refusal = (): ClaudeOutcome => ok(claudeMessage({ content: [], stop_reason: "refusal" }));
export const cutOff = (): ClaudeOutcome => ok(claudeMessage({ content: [], stop_reason: "max_tokens" }));
/** The texts a harness sent, in order. */
export const texts = (h: ReturnType<typeof harness>) => h.sends().map((s) => s[1]);
