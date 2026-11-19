import type { Locale } from "@/shared/i18n/config";
import type { BotContext } from "./context";
import { BOT_DICTIONARIES } from "./i18n";
import { type LaunchTab, launchesView, LIST_SIZE } from "./lists";
import { findAddress, isEvm, isTokenAddress } from "./text";
import type { TgMessage, View } from "./types";
import {
  cardView, checkPrompt, groupUsageView, helpView, homeView, notFoundView,
  referralPrompt, referralView, unavailableView,
} from "./views";

const COMMAND = /^\/([A-Za-z_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/;
/** The bot's own prompts for a wallet, in every language: a reply to one is a wallet, not a token. */
export const REFERRAL_PROMPTS = new Set(Object.values(BOT_DICTIONARIES).flatMap((d) => [d.referral.prompt, d.referral.notWallet, d.referral.isToken]));

export type Command = { name: string; arg: string };

/** A command for this bot, "other" for one addressed to another bot, or null for plain text. */
export function parseCommand(text: string, bot: string | null): Command | "other" | null {
  const m = text.trim().match(COMMAND);
  if (!m) return null;
  if (m[2] && (!bot || m[2].toLowerCase() !== bot.toLowerCase())) return "other";
  return { name: m[1].toLowerCase(), arg: (m[3] ?? "").trim() };
}

/** A card, or why there isn't one. `shared`: the card sits in a group or an inline message, where many people read it. */
export function cardFor(address: string, lang: Locale, ctx: BotContext, shared = false): View {
  if (!ctx.data.ready()) return unavailableView(lang);
  const token = ctx.data.token(address);
  return token ? cardView(token, lang, ctx.site, { shared }) : notFoundView(address, lang, ctx.site);
}

export function listFor(tab: LaunchTab, lang: Locale, ctx: BotContext): View {
  if (!ctx.data.ready()) return unavailableView(lang);
  const rows = tab === "trend" ? ctx.data.trending(LIST_SIZE) : ctx.data.latest(tab, LIST_SIZE);
  return launchesView(rows, tab, lang, ctx.site);
}

/** A wallet for a referral link; a token's own address is refused (the fee would go to the token, not the person). */
export function walletReply(text: string, lang: Locale, ctx: BotContext): View {
  const found = findAddress(text);
  if (!found || !isEvm(found)) return referralPrompt(lang, "notWallet");
  return ctx.data.ready() && ctx.data.token(found) ? referralPrompt(lang, "isToken") : referralView(found, lang, ctx.site);
}

export const helpFor = (lang: Locale, ctx: BotContext, group: boolean) => helpView(lang, ctx.site, { group, bot: ctx.inline() ? ctx.bot() : null });

export function privateCommand(cmd: Command, lang: Locale, ctx: BotContext): View {
  switch (cmd.name) {
    case "start": {
      // t.me/<bot>?start=c_<address> opens straight on that token's card.
      const deep = cmd.arg.match(/^c_([A-Za-z0-9]{32,44})$/)?.[1];
      const address = deep && /^0x/i.test(deep) ? deep.toLowerCase() : deep;
      if (address && isTokenAddress(address)) return cardFor(address, lang, ctx);
      if (cmd.arg === "ref") return referralPrompt(lang);
      if (cmd.arg === "help") return helpFor(lang, ctx, false);
      return homeView(lang, ctx.site);
    }
    case "check": {
      const address = findAddress(cmd.arg);
      return address ? cardFor(address, lang, ctx) : checkPrompt(lang);
    }
    case "launches":
      return listFor("tonk", lang, ctx);
    case "referral":
      return cmd.arg ? walletReply(cmd.arg, lang, ctx) : referralPrompt(lang);
    case "help":
      return helpFor(lang, ctx, false);
    default:
      return homeView(lang, ctx.site);
  }
}

/** In a group: /check (an address after it, or in the message it replies to), and /start or /help. */
export function groupCommand(cmd: Command, m: TgMessage, lang: Locale, ctx: BotContext): View | null {
  if (cmd.name === "check") {
    const replied = m.reply_to_message;
    const address = findAddress(cmd.arg) ?? findAddress(replied?.text ?? replied?.caption ?? "");
    return address ? cardFor(address, lang, ctx, true) : groupUsageView(lang);
  }
  if (cmd.name === "start" || cmd.name === "help") return helpFor(lang, ctx, true);
  return null;
}
