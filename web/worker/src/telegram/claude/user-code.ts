import { createHmac } from "node:crypto";
import type { UserId } from "../community/types";

/** The largest time a Date holds (ms either side of 1970). */
const MAX_DATE = 8.64e15;

/**
 * The pseudonymous code each request carries as metadata.user_id (decision
 * 14), so Anthropic can tell one abusive asker from the bot's whole account:
 * 32 hex characters of HMAC-SHA256 over "<UTC YYYY-MM>:<Telegram ID>", keyed
 * from the bot token (config.userCodeKey). It changes every month, and
 * without the key nobody can turn it back into the ID.
 */
export function userCode(key: string, user: UserId, now: number): string {
  // A clock reading that isn't a date never throws here: the month falls back to January 1970.
  const month = new Date(Math.abs(now) <= MAX_DATE ? now : 0).toISOString().slice(0, 7);
  return createHmac("sha256", key).update(`${month}:${user}`).digest("hex").slice(0, 32);
}
