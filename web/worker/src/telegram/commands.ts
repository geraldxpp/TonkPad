import type { Locale } from "@/shared/i18n/config";
import type { BotContext } from "./context";
import { BOT_DICTIONARIES } from "./i18n";
import { type LaunchTab, launchesView, LIST_SIZE } from "./lists";
import { findAddress, isEvm, isTokenAddress } from "./text";
import type { TgMessage, View } from "./types";
import {
  cardView, checkPrompt, groupUsageView, helpView, homeView, idView, notFoundView,
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

/** As parseCommand, for any of the bot's usernames (getMe's active_usernames, collectible ones included). */
export function commandOf(text: string, ctx: BotContext): Command | "other" | null {
  const names = ctx.me()?.usernames ?? [];
  const bot = ctx.bot();
  for (const name of names.length > 0 ? names : [bot]) {
    const found = parseCommand(text, name);
    if (found !== "other") return found;
  }
  return "other";
}

/** Whether AI answers are offered in private chats now (module 15): never without the community agent. */
export function aiOn(ctx: BotContext): boolean {
  try {
    return ctx.community?.aiOn() === true;
  } catch {
    return false;
  }
}

/** Whether AI answers run in the community groups now (a group's /help says how to ask there); as aiOn when the agent doesn't say. */
export function groupAiOn(ctx: BotContext): boolean {
  try {
    const community = ctx.community;
    return community ? (community.groupAi?.() ?? community.aiOn()) === true : false;
  } catch {
    return false;
  }
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

/** Whether a chat is the community agent's: one of its groups, or the admin chat. */
function communityChat(ctx: BotContext, chat: number | undefined): boolean {
  try {
    const community = ctx.community;
    return chat !== undefined && community !== undefined && (community.owns(chat) || community.isAdminChat(chat));
  } catch {
    return false;
  }
}

/**
 * /help: in a private chat its AI lines follow private AI; in a group they
 * follow the community groups' AI, but only in the agent's own groups and
 * the admin chat. Any other group gets module 14's help: no AI lines and no
 * Privacy button, since nothing there is answered by AI.
 */
export const helpFor = (lang: Locale, ctx: BotContext, group: boolean, chat?: number) =>
  helpView(lang, ctx.site, { group, bot: ctx.inline() ? ctx.bot() : null, ai: group ? communityChat(ctx, chat) && groupAiOn(ctx) : aiOn(ctx) });

/** A private chat's command; `userId` is the person's own (for /id, unlisted: their ID for the owner's setup). */
export function privateCommand(cmd: Command, lang: Locale, ctx: BotContext, userId?: number): View {
  switch (cmd.name) {
    case "start": {
      // t.me/<bot>?start=c_<address> opens straight on that token's card.
      const deep = cmd.arg.match(/^c_([A-Za-z0-9]{32,44})$/)?.[1];
      const address = deep && /^0x/i.test(deep) ? deep.toLowerCase() : deep;
      if (address && isTokenAddress(address)) return cardFor(address, lang, ctx);
      if (cmd.arg === "ref") return referralPrompt(lang);
      if (cmd.arg === "help") return helpFor(lang, ctx, false);
      return homeView(lang, ctx.site, { ai: aiOn(ctx) });
    }
    case "id":
      return userId === undefined ? homeView(lang, ctx.site, { ai: aiOn(ctx) }) : idView(lang, userId);
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
      return homeView(lang, ctx.site, { ai: aiOn(ctx) });
  }
}

/** In a group: /check (an address after it, or in the message it replies to), and /start or /help. */
export function groupCommand(cmd: Command, m: TgMessage, lang: Locale, ctx: BotContext): View | null {
  if (cmd.name === "check") {
    const replied = m.reply_to_message;
    const address = findAddress(cmd.arg) ?? findAddress(replied?.text ?? replied?.caption ?? "");
    return address ? cardFor(address, lang, ctx, true) : groupUsageView(lang);
  }
  if (cmd.name === "start" || cmd.name === "help") return helpFor(lang, ctx, true, m.chat.id);
  return null;
}
