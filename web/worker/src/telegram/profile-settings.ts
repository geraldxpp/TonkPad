import { type BotApi, TelegramError } from "./api";
import { BOT_DICTIONARIES } from "./i18n";
import type { Sleep } from "./sender";

/**
 * Inline feedback (Bot API 10.5's setMySettings, 22 Nov 2026), set by the
 * bot itself where it sets its profile (index-profile.ts). Telegram sends
 * chosen_inline_result, which inline mode's Ask TonkFun posts are paired
 * with (inline-pending.ts), only while it is on, so the bot asks for every
 * chosen result (a share of 1 in 1) while Ask can be offered (the community
 * agent answers with AI in its groups or in private chats: ProfileOptions.ai),
 * with the placeholder "Token address or a question" (one for every
 * language: setMySettings takes no language code), and for none (0)
 * otherwise, the placeholder left as it is: it receives chosen results only
 * while it uses them. Inline mode itself (supports_inline_queries) is never
 * changed. As the Sender does, a 429 waits Telegram's retry_after (3 times
 * at most) and a dropped connection is tried once more; a failure is logged
 * by the error's name alone and changes nothing else: Ask stays offered, and
 * its posts get the note that says to use /ask until feedback is on.
 */

/** What /health shows (telegram.inlineFeedback): feedback on, off, or the last set failed. */
export type InlineFeedback = "on" | "off" | "failed";

const RETRIES = 3;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** setMySettings' parameters for whether Ask can be offered: every chosen result and the placeholder, or none and the placeholder unchanged. */
export function inlineSettings(ask: boolean): Record<string, unknown> {
  return ask ? { inline_feedback_share_denominator: 1, inline_query_placeholder: BOT_DICTIONARIES.en.inline.placeholder } : { inline_feedback_share_denominator: 0 };
}

/** Sets inline feedback for whether Ask can be offered: "on" or "off" once Telegram took it, "failed" (one line in the log) when it didn't. Never throws. */
export async function setInlineFeedback(api: BotApi, ask: boolean, log: (line: string) => void, sleep: Sleep = realSleep): Promise<InlineFeedback> {
  for (let tries = 0; ; tries += 1) {
    try {
      await api.call<boolean>("setMySettings", inlineSettings(ask));
      return ask ? "on" : "off";
    } catch (error) {
      const e = error instanceof TelegramError ? error : null;
      const pause = e?.status === 429 && tries < RETRIES ? (e.retryAfter ?? 1) * 1_000 : e?.status === 0 && tries < 1 ? 1_000 : null;
      if (pause !== null) {
        await sleep(pause);
        continue;
      }
      log(`inline feedback: setMySettings failed (${error instanceof Error ? error.name : "error"}); turn it ${ask ? "on" : "off"} with /setinlinefeedback in @BotFather`);
      return "failed";
    }
  }
}
