import { claimsBrand } from "../channel";
import { hasRoleWord } from "./names";
import type { RuleInput } from "./rules";

/**
 * Forwards (prompts/15-community-agent.md, The rules): who vouches for one.
 * By ID: the bot itself and the group's admins, by the ID Telegram gives a
 * user forward (forwardSelf, forwardAdmin), and the official channel, by
 * its chat ID (forwardChannel: media.ts fromChannel, by its username only
 * when TELEGRAM_CHANNEL_ID gives no ID). Those are words the member didn't
 * write, never punished for what they say (rules-scan.ts botsOwnOf). By
 * username alone, the official channel, the community groups and the admins
 * vouch for less: such a forward is never a brand forward nor a new member's
 * link, but is otherwise read as the member's own words. One of the bot's
 * usernames never vouches: a username can pass to another account (one the
 * bot dropped while the worker keeps its startup getMe, say), and the
 * allow-list and Telegram's admin list both hold the bot's.
 */

/** What the forward rules read. */
export type ForwardInput = Pick<RuleInput, "forwarded" | "forwardName" | "forwardUsername" | "forwardSelf" | "forwardAdmin" | "forwardChannel" | "allow" | "admins" | "bot">;

const key = (name: string) => name.toLowerCase().replace(/^@/, "");

/** Whether the forward's author vouches for it: the bot, an admin or the official channel by ID, or the official channel, a community group or an admin by username. */
export function vouched(input: ForwardInput): boolean {
  if (input.forwardSelf === true || input.forwardAdmin === true || input.forwardChannel === true) return true;
  const bot = new Set(input.bot.map(key));
  const vouchers = [...input.allow.telegram, ...input.admins.flatMap((a) => (a.username ? [a.username] : []))].map(key).filter((n) => !bot.has(n));
  const from = typeof input.forwardUsername === "string" ? key(input.forwardUsername) : "";
  return from !== "" && vouchers.includes(from);
}

/** A brand forward: a forward from a chat or user whose name uses the brand or a role word, unless its author vouches for it. */
export function brandForward(input: ForwardInput): boolean {
  if (!input.forwarded || !input.forwardName || vouched(input)) return false;
  return claimsBrand(input.forwardName, "") || hasRoleWord(input.forwardName);
}

/**
 * A new member's forward that counts as a link (rules.ts linkHits): any
 * but one its author vouches for. What it says is still read as any
 * message is: its links, link buttons and handles count as they would
 * anywhere. Someone else's post of the bot's card, passed on, still counts
 * (its header names that someone); being the bot's own words, it is only
 * removed, never punished (mod/actions-decide.ts `own`), as are the links
 * in a forward vouched for by ID.
 */
export const newcomerForward = (input: ForwardInput): boolean => input.forwarded && !vouched(input);
