import { type Locale, localizePath } from "@/shared/i18n/config";
import { LAUNCHPADS } from "@/shared/config/launchpads";
import { formatChange, formatInteger, formatUsdCompact } from "@/shared/lib/format";
import type { Token } from "@/shared/types/token";
import { LINK_PATHS } from "./agent/render";
import { words } from "./i18n";
import { communityWords } from "./i18n/community";
import { docsUrl, homeUrl, refUrl, shareUrl, tokenUrl } from "./links";
import { escapeHtml as esc, fill, isEvm, plainText, safeText } from "./text";
import type { Button, View } from "./types";

/**
 * What the bot shows, as HTML for Telegram's parse mode. A clear title, short
 * lines, the figures in bold, one obvious next step: chain text goes through
 * safeText, the bot's own words through esc or fill.
 */

export const CHAINS: Record<Token["chain"], string> = { rh: "Robinhood Chain", sol: "Solana" };

/** A link button: Telegram marks it with its own corner arrow. */
export const link = (text: string, url: string): Button => ({ text, url });
const act = (text: string, data: string): Button => ({ text, callback_data: data });

/** The badges Explore shows on a token, in the bot's words. */
export function badges(token: Token, lang: Locale): string[] {
  const b = words(lang).badges;
  const out: string[] = [];
  if (token.flags.locked) out.push(b.locked);
  if (token.flags.crew) out.push(b.crew.replace("{pct}", token.flags.crew));
  if (token.shield) out.push(b.shield);
  if (token.flags.agent) out.push(b.agent);
  if (token.curve >= 1) out.push(b.graduated);
  if (token.issuer) out.push(b.rwa);
  return out;
}

/** "Mission score 78 · Safe", the score in bold. */
export const scoreLine = (token: Token, lang: Locale) =>
  fill(words(lang).card.score, { score: `<b>${Math.round(token.score)}</b>`, level: esc(words(lang).levels[token.level]) });

/** "<b>Whoa the Tarsier</b> · WHOA" */
export const nameLine = (token: Token) => `<b>${safeText(token.name, 40)}</b> · ${safeText(token.ticker, 16)}`;

/**
 * A token's card: who it is, its Mission score and badges, its key figures,
 * and its full address to copy. A `shared` card (in a group or an inline
 * message) links the site without a language prefix, so each reader gets
 * their own; its Refresh keeps the card's language whoever presses it.
 */
export function cardView(token: Token, lang: Locale, site: string, options: { shared?: boolean } = {}): View {
  const d = words(lang);
  const lines = [nameLine(token), esc(`${LAUNCHPADS[token.launchpad]?.name ?? token.launchpad} · ${CHAINS[token.chain]}`), "", scoreLine(token, lang)];
  const tags = badges(token, lang);
  if (tags.length > 0) lines.push(esc(tags.join(" · ")));
  lines.push("");
  if (token.marketCap > 0) {
    lines.push(fill(d.card.marketCap, { value: `<b>${formatUsdCompact(token.marketCap)}</b>` }));
    lines.push(fill(d.card.change, { value: `<b>${formatChange(token.change24h)}</b>` }));
  } else {
    lines.push(esc(d.card.noMarket));
  }
  lines.push(token.curve >= 1 ? esc(d.card.graduated) : fill(d.card.curve, { value: `<b>${Math.floor(token.curve * 100)}%</b>` }));
  if (token.holders !== null) lines.push(fill(d.card.holders, { value: `<b>${formatInteger(token.holders)}</b>` }));
  lines.push("", `<code>${esc(token.address)}</code>`);
  const url = tokenUrl(site, options.shared ? "en" : lang, token.address);
  const share = shareUrl(url, d.card.shareText.replace("{name}", plainText(token.name, 40)));
  return {
    text: lines.join("\n"),
    keyboard: { inline_keyboard: [[link(d.card.open, url)], [act(d.card.refresh, `r:${lang}:${token.address}`), { text: d.card.share, url: share }]] },
  };
}

/**
 * An address the worker doesn't follow, said plainly with what it does follow.
 * Only a 0x address gets a token link: the site can still read a tonkfun.fun
 * launch the feed hasn't reached; anything else would open a dead end.
 */
export function notFoundView(address: string, lang: Locale, site: string): View {
  const d = words(lang).check;
  const button = isEvm(address) ? link(d.lookUp, tokenUrl(site, lang, address)) : link(words(lang).home.open, homeUrl(site, lang));
  return { text: `<b>${esc(d.notFound)}</b>\n${esc(d.notFoundBody)}\n\n<code>${esc(address)}</code>`, keyboard: { inline_keyboard: [[button]] } };
}

const homeRows = (lang: Locale): Button[][] => {
  const d = words(lang).home;
  return [[act(d.check, "check"), act(d.launches, "l:tonk")], [act(d.referral, "ref"), act(d.help, "help")]];
};

/** The bot's privacy policy (/privacy/telegram), in the visitor's language. */
const privacyUrl = (site: string, lang: Locale) => `${site}${localizePath(lang, LINK_PATHS.privacy)}`;

/** The private chat's menu; with AI answers on (module 15) it opens with Ask a question, which shows the Ask prompt. */
export function homeView(lang: Locale, site: string, options: { ai: boolean } = { ai: false }): View {
  const d = words(lang).home;
  const ask: Button[][] = options.ai ? [[act(d.ask, "askp")]] : [];
  return {
    text: `<b>tonkfun.fun</b>\n${esc(d.body)}\n\n${esc(d.hint)}`,
    keyboard: { inline_keyboard: [...ask, ...homeRows(lang), [link(d.open, homeUrl(site, lang))]] },
  };
}

/** Text in a private chat that holds no address: what to send, and the menu. */
export function notAddressView(lang: Locale): View {
  const d = words(lang).check;
  return { text: `<b>${esc(d.notAddress)}</b>\n${esc(d.notAddressBody)}`, keyboard: { inline_keyboard: homeRows(lang) } };
}

/**
 * How the bot works. With AI answers on (module 15) it says how to ask (in
 * a group: mention it, reply to it or /ask in the community group), that
 * the answers are written by AI and can be wrong, and links the privacy policy.
 */
export function helpView(lang: Locale, site: string, options: { group: boolean; bot: string | null; ai: boolean }): View {
  const d = words(lang).help;
  const c = communityWords(lang).help;
  const ask = options.ai ? [options.group ? c.groupAsk : c.ask] : [];
  const bullets = options.group ? [...ask, d.groups] : [...ask, d.paste, d.launches, d.referral, d.groups];
  const lines = bullets.map((line) => `• ${esc(line)}`);
  if (!options.group && options.bot) lines.push(`• ${fill(d.inline, { bot: esc(options.bot) })}`);
  const ai = options.ai ? [esc(c.ai), ""] : [];
  const text = [`<b>${esc(d.title)}</b>`, "", ...lines, "", ...ai, esc(d.score), "", esc(d.safety)].join("\n");
  const site_ = link(words(lang).home.open, homeUrl(site, lang));
  const privacy = link(c.privacy, privacyUrl(site, lang));
  const docs = link(d.docs, docsUrl(site, lang));
  const back = [act(`‹ ${words(lang).common.back}`, "home")];
  const rows = options.group
    ? [options.ai ? [site_, privacy] : [site_]]
    : options.ai ? [[docs, privacy], [site_], back] : [[docs, site_], back];
  return { text, keyboard: { inline_keyboard: rows } };
}

/** /id (private, unlisted): the person's own Telegram ID, for the owner's setup (TELEGRAM_OWNER_IDS). Nothing is kept. */
export function idView(lang: Locale, userId: number): View {
  const id = Number.isSafeInteger(userId) ? String(userId) : "?";
  return { text: `${esc(communityWords(lang).id.yours)} <code>${id}</code>` };
}

/** A private /report with nothing after it: how to use it there (write what happened after it); a group's own line says to reply to the message. */
export const reportUsageView = (lang: Locale): View => ({ text: esc(communityWords(lang).report.usagePrivate) });

/** A private /report with words that can't reach the team now (community mode turned off): the Security page's contact instead. */
export const reportClosedView = (lang: Locale): View => ({ text: esc(communityWords(lang).report.noAdminChat) });

export function checkPrompt(lang: Locale): View {
  const d = words(lang).check;
  return { text: esc(d.prompt), forceReply: { force_reply: true, input_field_placeholder: d.placeholder.slice(0, 64) } };
}

/** Asks for the wallet a referral link pays: first time, after something that isn't a wallet, or after a token's own address. */
export function referralPrompt(lang: Locale, variant: "prompt" | "notWallet" | "isToken" = "prompt"): View {
  const d = words(lang).referral;
  return { text: esc(d[variant]), forceReply: { force_reply: true, input_field_placeholder: d.placeholder.slice(0, 64) } };
}

/** A wallet's referral link, what it pays and its limits, ready to share. */
export function referralView(wallet: string, lang: Locale, site: string): View {
  const d = words(lang).referral;
  const url = refUrl(site, wallet);
  return {
    text: `<b>${esc(d.title)}</b>\n<code>${esc(url)}</code>\n\n${esc(d.pays)}\n${esc(d.limits)}`,
    keyboard: { inline_keyboard: [[{ text: d.share, url: shareUrl(url, d.shareText) }, link(d.open, url)]] },
  };
}

export const unavailableView = (lang: Locale): View => ({ text: esc(words(lang).common.unavailable) });
export const groupUsageView = (lang: Locale): View => ({ text: esc(words(lang).check.groupUsage) });
