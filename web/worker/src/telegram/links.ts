import { type Locale, localizePath } from "@/shared/i18n/config";
import { referralLink } from "@/shared/tonk/referral";

/**
 * Links the bot hands out, all to the site (`site` is its origin, e.g.
 * https://www.tonkfun.fun), in the visitor's language. Only validated
 * addresses ever go into them.
 */
export const tokenUrl = (site: string, lang: Locale, address: string) => `${site}${localizePath(lang, `/token/${address}`)}`;
export const homeUrl = (site: string, lang: Locale) => `${site}${localizePath(lang, "/")}`;
export const docsUrl = (site: string, lang: Locale) => `${site}${localizePath(lang, "/docs")}`;

/** Explore with its own view state, e.g. "pad=tonk" or "tab=trending". */
export const exploreUrl = (site: string, lang: Locale, query: string) => `${homeUrl(site, lang)}?${query}`;

/** A wallet's referral link: the site's home with ?ref=, unprefixed so each visitor gets their own language. */
export const refUrl = (site: string, wallet: string) => referralLink(site, "/", wallet);

/** Telegram's share sheet for a link. */
export const shareUrl = (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
