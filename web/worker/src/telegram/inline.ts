import type { Locale } from "@/shared/i18n/config";
import type { Token } from "@/shared/types/token";
import type { BotContext, InlineArticle } from "./context";
import { botLocale, words } from "./i18n";
import { findAddress, plainText } from "./text";
import type { TgInlineQuery } from "./types";
import { cardView } from "./views";

/** A token's card offered in any chat through inline mode (@bot <address>). */
export function inlineArticle(token: Token, lang: Locale, site: string): InlineArticle {
  const d = words(lang);
  const card = cardView(token, lang, site, { shared: true });
  return {
    type: "article",
    id: token.address.slice(0, 64),
    title: `${plainText(token.name, 40)} · ${plainText(token.ticker, 16)}`,
    description: d.card.score.replace("{score}", String(Math.round(token.score))).replace("{level}", d.levels[token.level]),
    input_message_content: { message_text: card.text, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    reply_markup: card.keyboard,
  };
}

export async function onInline(q: TgInlineQuery, ctx: BotContext): Promise<void> {
  const now = ctx.now();
  if (!ctx.inlineLimiter.allow(q.from.id, now) || !ctx.inlineAll.allow(0, now)) return;
  const lang = botLocale(q.from.language_code);
  const address = findAddress(q.query ?? "");
  const token = address && ctx.data.ready() ? ctx.data.token(address) : null;
  const button = address && !token ? words(lang).inline.notFound : words(lang).inline.help;
  await ctx.out.inline(q.id, token ? [inlineArticle(token, lang, ctx.site)] : [], button);
}
