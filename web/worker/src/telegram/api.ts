import type { Fetch } from "../alerts/deliver";

/**
 * A Bot API call that failed. It carries only Telegram's own description,
 * never the request URL (which holds the token).
 */
export class TelegramError extends Error {
  constructor(
    readonly status: number,
    readonly description: string,
    /** Seconds Telegram asks the bot to wait (on a 429), or null. */
    readonly retryAfter: number | null,
  ) {
    super(`telegram ${status || "unreachable"}${description ? `: ${description}` : ""}`);
    this.name = "TelegramError";
  }
}

export interface BotApi {
  call<T>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T>;
}

interface Reply<T> {
  ok?: boolean;
  result?: T;
  description?: unknown;
  parameters?: { retry_after?: unknown };
}

/** Telegram's Bot API for one bot token: POST with a JSON body, the answer's `result` or a TelegramError. */
export function botApi(token: string, fetchFn: Fetch = fetch, base = "https://api.telegram.org"): BotApi {
  return {
    async call<T>(method: string, params: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
      let res: Response;
      try {
        res = await fetchFn(`${base}/bot${token}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new TelegramError(0, "", null);
      }
      const body = (await res.json().catch(() => null)) as Reply<T> | null;
      if (res.ok && body?.ok === true) return body.result as T;
      const description = typeof body?.description === "string" ? body.description.slice(0, 160) : "";
      const retry = body?.parameters?.retry_after;
      throw new TelegramError(res.status, description, typeof retry === "number" && retry > 0 ? retry : null);
    },
  };
}
