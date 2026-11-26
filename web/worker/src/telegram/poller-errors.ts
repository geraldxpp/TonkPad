import { type BotApi, TelegramError } from "./api";
import type { PollState } from "./poller";
import type { Sleep } from "./sender";

export interface PollErrorDeps {
  api: BotApi;
  log: (line: string) => void;
  sleep: Sleep;
  setState(state: PollState): void;
  /** The wait before the next try after any other failure. */
  backoff: number;
}

/**
 * What a failed getUpdates means (poller.ts): a refused token (401, or 404
 * for a token Telegram doesn't know) stops polling; a 409 means a webhook is
 * set (removed, then polling resumes) or another process is polling the
 * same bot (waited out); anything else waits `backoff`. False to stop.
 */
export async function afterPollError(error: unknown, deps: PollErrorDeps): Promise<boolean> {
  const e = error instanceof TelegramError ? error : null;
  if (e?.status === 401 || e?.status === 404) {
    deps.setState("unauthorized");
    deps.log("Telegram refused the bot token; polling stopped (check TELEGRAM_BOT_TOKEN)");
    return false;
  }
  if (e?.status === 409) {
    deps.setState("conflict");
    if (/webhook/i.test(e.description)) {
      await deps.api.call("deleteWebhook", { drop_pending_updates: false }).catch(() => null);
      deps.log("removed a webhook so long polling can run");
      await deps.sleep(2_000);
      return true;
    }
    deps.log("another process is polling this bot; waiting");
    await deps.sleep(30_000);
    return true;
  }
  deps.setState("error");
  await deps.sleep(deps.backoff);
  return true;
}
