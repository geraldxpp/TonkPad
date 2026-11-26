import type { Locale } from "@/shared/i18n/config";
import { askLine, askPost, forwarded, viaMe } from "./agent/triggers";
import { aiOn, cardFor, type Command, privateCommand, REFERRAL_PROMPTS, walletReply } from "./commands";
import { promptView } from "./community/qa-press";
import type { CommunityHooks } from "./community/types";
import type { BotContext } from "./context";
import { ASK_PROMPTS, communityWords } from "./i18n/community";
import { startPairing } from "./inline-pending";
import { visibleText } from "../text";
import { escapeHtml as esc, findAddress } from "./text";
import type { TgMessage, TgUser, View } from "./types";
import { notAddressView, reportClosedView, reportUsageView } from "./views";

/**
 * A private chat (prompts/15-community-agent.md, Where it answers). Module
 * 14's commands, cards and referral links as before; with the community
 * agent on, /ask, a reply to its Ask prompt and inline mode's Ask post
 * (/ask with the question it was chosen for, inline-pending.ts) are
 * answered at once, /report shares a report by the member's choice, /start
 * appeal opens a review, and other text that isn't a bare address is
 * offered to the AI with an Ask button: nothing goes to Anthropic until it
 * is tapped. A forwarded /ask or /report is someone else's words: router.ts
 * reads it as text, offered Ask like the rest. A forwarded Ask post gets no
 * reply, nor does the bot's own card while AI answers here (no Ask offer
 * under it, nor the card again); with AI off it gets a fresh card, as
 * module 14 always gave.
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

/** "I didn't get your question": an Ask post whose question never came. */
const lostView = (lang: Locale): View => ({ text: esc(communityWords(lang).answer.askLost) });

/**
 * The person's own Ask post: /ask with the question it was chosen for in
 * the bot's own chat (a result offered in a group never pairs with it:
 * inline-pending.ts), once that comes (5 seconds at most), else the note
 * that says to use /ask; module 14's reply when private answers went off
 * meanwhile. Nothing waits on it, and a failure is noted without text.
 */
function askPosted(m: TgMessage, lang: Locale, ctx: BotContext, community: CommunityHooks): void {
  void startPairing(m, ctx)
    ?.then(async (ask) => {
      if (ask && (await community.askPrivate(m, ask.question))) return;
      await ctx.out.send(m.chat, ask ? notAddressView(lang) : lostView(lang));
    })
    .catch(() => ctx.log?.("an Ask post wasn't answered"));
}

export async function onPrivate(m: TgMessage, from: TgUser, text: string, cmd: Command | null, lang: Locale, ctx: BotContext): Promise<void> {
  const community = ctx.community;
  const me = ctx.me();
  const ai = community !== undefined && aiOn(ctx);
  // The bot's own card (via the bot, with its buttons; the bot known by its ID), shared or forwarded: no reply while AI answers here.
  if (ai && viaMe(m, me) === "card") return;
  // Inline mode's Ask posts its fixed line, never the question: a forward of one is ignored; the person's own is paired with its question.
  if (askLine(m, me) && forwarded(m)) return;
  if (ai && community && askPost(m, me)) return askPosted(m, lang, ctx, community);
  if (cmd) {
    if (community && (await communityCommand(m, cmd, lang, ctx, community))) return;
    return ctx.out.send(m.chat, privateCommand(cmd, lang, ctx, from.id));
  }
  const prompt = promptOf(m, ctx);
  if (REFERRAL_PROMPTS.has(prompt)) return ctx.out.send(m.chat, walletReply(text, lang, ctx));
  if (community && ASK_PROMPTS.has(prompt) && (await community.askPrivate(m, text))) return;
  const address = findAddress(text);
  if (address && (!ai || bareAddress(text, address))) return ctx.out.send(m.chat, cardFor(address, lang, ctx));
  if (ai && community && (await community.offerPrivate(m, text))) return;
  await ctx.out.send(m.chat, address ? cardFor(address, lang, ctx) : notAddressView(lang));
}
