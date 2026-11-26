import { isLocale, type Locale } from "@/shared/i18n/config";
import type { Strictness, UserId } from "../community/types";
import type { CommunityDictionary } from "../community/words";
import { escapeHtml as esc, fill } from "../text";
import type { InlineKeyboard, TgUser } from "../types";
import { durationText, mentionsIn } from "./notices";

/**
 * What the new-member check shows (prompts/15-community-agent.md, The
 * new-member check): the prompt, which mentions each newcomer with a fixed
 * word and never a name, its button or, in strict mode or a raid, 4 numbered
 * buttons ("Tap 7"); and the welcome once they pass.
 */

const MINUTE = 60_000;
export const DAY_MS = 24 * 60 * MINUTE;

/** How long a newcomer has: relaxed 10 minutes, normal 5, the hard check (strict mode or a raid) 3. */
export function checkMs(strictness: Strictness, hard: boolean): number {
  if (hard) return 3 * MINUTE;
  return strictness === "relaxed" ? 10 * MINUTE : 5 * MINUTE;
}

/** How long stricter rules apply after the check (observe marks members for 3 days without checking). */
export const NEWCOMER_DAYS: Record<Strictness, number> = { observe: 3, relaxed: 1, normal: 3, strict: 7 };

/** The number a hard check asks for, 1 to 9. */
export const pickTarget = (): number => 1 + Math.floor(Math.random() * 9);

/** A hard check's 4 buttons: the number to tap and three others, in order, always the same set for one number (so an edit keeps them). */
export function choices(target: number): number[] {
  return [0, 2, 4, 6].map((step) => ((target - 1 + step) % 9) + 1).sort((a, b) => a - b);
}

export function checkHtml(users: ReadonlyArray<{ id: UserId }>, d: CommunityDictionary, lang: Locale, durationMs: number, target: number | null): string {
  const prompt = fill(d.check.prompt, { mentions: mentionsIn(users, d), duration: esc(durationText(durationMs / 1000, d, lang)) });
  return target === null ? prompt : `${prompt}\n${fill(d.check.choose, { target })}`;
}

/** h:0 for the one-button check, h:<number> for each of a hard check's four. */
export function checkKeyboard(d: CommunityDictionary, target: number | null): InlineKeyboard {
  if (target === null) return { inline_keyboard: [[{ text: d.check.button, callback_data: "h:0" }]] };
  return { inline_keyboard: [choices(target).map((n) => ({ text: String(n), callback_data: `h:${n}` }))] };
}

export const welcomeHtml = (users: ReadonlyArray<{ id: UserId }>, d: CommunityDictionary): string => fill(d.check.welcome, { mentions: mentionsIn(users, d) });

/** The welcome's Privacy button, to the bot's privacy page (unprefixed, so each reader gets their own language). */
export const welcomeKeyboard = (d: CommunityDictionary, site: string | undefined): InlineKeyboard | undefined =>
  site ? { inline_keyboard: [[{ text: d.links.privacy, url: `${site}/privacy/telegram` }]] } : undefined;

/** A toast in the presser's own app language when the site has it, else the group's. */
export function langOf(user: TgUser, fallback: Locale): Locale {
  const code = user.language_code?.toLowerCase().split("-")[0];
  return code && isLocale(code) ? code : fallback;
}

export const displayName = (u: TgUser): string => [u.first_name, u.last_name].filter((part): part is string => typeof part === "string" && part !== "").join(" ");

export const validUser = (u: TgUser | null | undefined): u is TgUser => !!u && Number.isSafeInteger(u.id) && u.id > 0;
