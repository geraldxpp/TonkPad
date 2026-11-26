import type { Locale } from "@/shared/i18n/config";
import { aiOn, cardFor, type Command, privateCommand, REFERRAL_PROMPTS, walletReply } from "./commands";
import { promptView } from "./community/qa-press";
import type { CommunityHooks } from "./community/types";
import type { BotContext } from "./context";
import { ASK_PROMPTS, communityWords } from "./i18n/community";
import { visibleText } from "../text";
import { findAddress } from "./text";
import type { TgMessage, TgUser } from "./types";
import { notAddressView, reportClosedView, reportUsageView } from "./views";

/**
 * A private chat (prompts/15-community-agent.md, Where it answers). Module
 * 14's commands, cards and referral links as before; with the community
 * agent on, /ask and a reply to its Ask prompt are answered at once, /report
 * shares a report by the member's choice, /start appeal opens a review, and
 * other text that isn't a bare address is offered to the AI with an Ask
 * button: nothing goes to Anthropic until it is tapped.
 */

/** Words besides an address that still leave it bare: "CA: 0x…", "check this 0x… please", or a token page's link. */
const BARE_WORDS = 3;

/** An address, or a link holding one, with at most 3 other words: a request for its card, not a question. */
export function bareAddress(text: string, address: string): boolean {
  const lower = address.toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean);
  const others = words.filter((word) => !word.toLowerCase().includes(lower));
  return others.length < words.length && others.length <= BARE_WORDS;
}

/** The text of the bot's own message this one replies to, or "". */
function promptOf(m: TgMessage, ctx: BotContext): string {
  const replied = m.reply_to_message;
  const author = replied?.from;
  if (!replied || !author || author.is_bot !== true) return "";
  const me = ctx.me();
  if (me !== null && author.id !== me.id) return "";
  return typeof replied.text === "string" ? replied.text : "";
}

/** /ask, /report and /start appeal, for the community agent: true when it took the command. */
async function communityCommand(m: TgMessage, cmd: Command, lang: Locale, ctx: BotContext, community: CommunityHooks): Promise<boolean> {
  if (cmd.name === "ask") {
    if (cmd.arg !== "") return community.askPrivate(m, cmd.arg);
    // /ask alone: the Ask prompt, whose reply is the question (only while AI answers are offered).
    if (!aiOn(ctx)) return false;
    await ctx.out.send(m.chat, promptView(communityWords(lang)));
    return true;
  }
  if (cmd.name === "report") {
    // Taken (shared, or refused with a reply): done. Otherwise nothing to share means how to use it, and words it couldn't take mean reports can't reach the team now.
    if (!(await community.reportPrivate(m, cmd.arg))) await ctx.out.send(m.chat, visibleText(cmd.arg) === "" ? reportUsageView(lang) : reportClosedView(lang));
    return true;
  }
  return cmd.name === "start" && cmd.arg === "appeal" && (await community.startPrivate(m, cmd.arg));
}

export async function onPrivate(m: TgMessage, from: TgUser, text: string, cmd: Command | null, lang: Locale, ctx: BotContext): Promise<void> {
  const community = ctx.community;
  if (cmd) {
    if (community && (await communityCommand(m, cmd, lang, ctx, community))) return;
    return ctx.out.send(m.chat, privateCommand(cmd, lang, ctx, from.id));
  }
  const prompt = promptOf(m, ctx);
  if (REFERRAL_PROMPTS.has(prompt)) return ctx.out.send(m.chat, walletReply(text, lang, ctx));
  if (community && ASK_PROMPTS.has(prompt) && (await community.askPrivate(m, text))) return;
  const address = findAddress(text);
  const offer = community !== undefined && aiOn(ctx);
  if (address && (!offer || bareAddress(text, address))) return ctx.out.send(m.chat, cardFor(address, lang, ctx));
  if (offer && community && (await community.offerPrivate(m, text))) return;
  await ctx.out.send(m.chat, address ? cardFor(address, lang, ctx) : notAddressView(lang));
}
