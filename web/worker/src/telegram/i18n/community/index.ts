import type { Locale } from "@/shared/i18n/config";
import type { CommunityDictionary } from "../../community/words";
import { de } from "./de";
import { en } from "./en";
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

/**
 * The community agent's words in each of the site's languages (module 15).
 * English is the source; telegram-community-i18n.test.ts holds every other
 * language to its keys and {placeholders}.
 */
export const COMMUNITY_DICTIONARIES: Record<Locale, CommunityDictionary> = { en, es, pt, fr, de, ru, tr, zh, ja, ko, vi, id };

/** A language's community words; English for anything that isn't one of the site's languages. */
export const communityWords = (lang: Locale): CommunityDictionary =>
  Object.hasOwn(COMMUNITY_DICTIONARIES, lang) ? COMMUNITY_DICTIONARIES[lang] : en;

/** The Ask prompt in every language: a private reply to one is a question for the AI. */
export const ASK_PROMPTS: ReadonlySet<string> = new Set(Object.values(COMMUNITY_DICTIONARIES).map((d) => d.answer.askPrompt));
