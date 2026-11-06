import type { Locale } from "../config";
import { de } from "./de";
import { type Dictionary, en } from "./en";
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
 * Every language's messages. Only server code imports this map; the browser
 * receives the one dictionary it needs through I18nProvider.
 */
export const DICTIONARIES: Record<Locale, Dictionary> = { en, es, pt, fr, de, ru, tr, zh, ja, ko, vi, id };

export type { Dictionary };
