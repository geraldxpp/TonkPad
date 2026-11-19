import { isLocale, type Locale } from "@/shared/i18n/config";
import { de } from "./de";
import { type BotDictionary, en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { id } from "./id";
import { ja } from "./ja";
import { ko } from "./ko";
import { pt } from "./pt";
import { ru } from "./ru";
import { tr } from "./tr";
import { vi } from "./vi";
import { zh } from "./zh";

/** The bot's words in each of the site's languages. */
export const BOT_DICTIONARIES: Record<Locale, BotDictionary> = { en, es, pt, fr, de, ru, tr, zh, ja, ko, vi, id };

export type { BotDictionary };

/**
 * The site's language for a Telegram user's app language ("pt-br" → pt,
 * "zh-hans" → zh, the old "in" → id); English for any other.
 */
export function botLocale(code: string | undefined): Locale {
  const primary = (code ?? "").toLowerCase().split(/[-_]/)[0];
  const mapped = primary === "in" ? "id" : primary;
  return isLocale(mapped) ? mapped : "en";
}

export const words = (locale: Locale): BotDictionary => BOT_DICTIONARIES[locale];
