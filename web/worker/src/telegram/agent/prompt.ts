import type Anthropic from "@anthropic-ai/sdk";
import { isLocale, type Locale, localeName } from "@/shared/i18n/config";
import type { OfficialAccounts } from "../community/types";
import { rulesTemplate } from "./prompt-rules";
import { addressOf } from "./schema";
import type { AnswerRequest, Pack, SiteFacts } from "./types";

/**
 * What the answer model reads (prompts/15-community-agent.md, Request
 * settings). The system prompt is three blocks: the rules (byte-stable:
 * no date, ID or anything per question), then the English core with the
 * site's two lines, then the asker's glossary when they aren't English;
 * the last two each end a 1-hour cache breakpoint. Everything per question
 * goes in answerContext, a system message after the question.
 */

const MAX_NAMES = 30;
const MAX_ADDRESSES = 5;
const NAME = /^[a-z0-9_]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Config values as the prompt shows them: lower case, well formed, unique and sorted, so their order never changes a byte. */
function names(values: unknown): string[] {
  const list: unknown[] = Array.isArray(values) ? values : [];
  const clean = list.flatMap((v) => (typeof v === "string" ? [v.trim().toLowerCase().replace(/^@/, "")] : [])).filter((v) => NAME.test(v));
  return [...new Set(clean)].sort().slice(0, MAX_NAMES);
}

const handles = (values: unknown) => {
  const list = names(values);
  return list.length > 0 ? list.map((n) => `@${n}`).join(", ") : "none";
};

/** The site's origin (scheme, host and port only), or "none" for anything that isn't a plain https address. */
function siteOf(site: unknown): string {
  try {
    const url = new URL(typeof site === "string" ? site.trim() : "");
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : "none";
  } catch {
    return "none";
  }
}

/** The rules with the official accounts filled in. */
function rulesText(official: OfficialAccounts): string {
  const values: Record<string, string> = {
    bot: handles(official.bot),
    channel: handles(official.channel ? [official.channel] : []),
    groups: handles(official.groups),
    x: handles(official.x),
    site: siteOf(official.site),
  };
  return rulesTemplate().replace(/\{(bot|channel|groups|x|site)\}/g, (_match, key: string) => values[key]);
}

/** The site's two lines (prompts/15-community-agent.md, What the site adds): whether Launch is invite-only, and its Security contact. */
export function siteLines(site: SiteFacts | null): string {
  const launch =
    site?.inviteOnly === true
      ? "- Launch is invite-only for now: only invited creator wallets can launch, and the site builds a launch for no other wallet."
      : site?.inviteOnly === false
        ? "- Launch is open: any wallet can launch a token from the Creator Studio."
        : "- Whether Launch is invite-only right now isn't known here: the Launch page shows it.";
  const how = 'Call it "the contact on the Security page" and add the security link; never write the contact itself.';
  const contact = site?.contact
    ? `- The Security page's contact is ${site.contact.kind === "email" ? "an e-mail address" : "a link"}: ${site.contact.text}. ${how}`
    : site
      ? "- The Security page lists no contact right now."
      : `- The contact for flaw reports and business questions is on the Security page. ${how}`;
  return ["[site] What the deployed site says now", launch, contact].join("\n");
}

/** The core block's text: the pack's English core, then the site's lines. */
export const coreText = (pack: Pack): string => `${pack.core}\n\n${siteLines(pack.site)}`;

/** The asker's glossary when they aren't English and the pack has one, else null. */
export function glossaryText(pack: Pack, lang: Locale): string | null {
  if (lang === "en" || !isLocale(lang)) return null;
  const text = pack.glossary[lang];
  return typeof text === "string" && text.trim() !== "" ? text : null;
}

/** The system prompt: [rules, core and site lines (cached 1 h), glossary (cached 1 h, not for English)]. */
export function answerSystem(pack: Pack, lang: Locale, official: OfficialAccounts): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: rulesText(official) },
    { type: "text", text: coreText(pack), cache_control: { type: "ephemeral", ttl: "1h" } },
  ];
  const glossary = glossaryText(pack, lang);
  if (glossary !== null) blocks.push({ type: "text", text: glossary, cache_control: { type: "ephemeral", ttl: "1h" } });
  return blocks;
}

/** The addresses get_token may read: the asker's own and the card's, each checked, at most 6 in all. */
export function askableOf(req: Pick<AnswerRequest, "askerAddresses" | "cardAddress">): string[] {
  const asker = Array.isArray(req.askerAddresses) ? req.askerAddresses.map(addressOf) : [];
  return [...new Set([...asker.filter((a): a is string => a !== null).slice(0, MAX_ADDRESSES), addressOf(req.cardAddress)].filter((a): a is string => a !== null))];
}

/**
 * The system message after the question: today's UTC date, the reply's
 * language, the chat and its length, the mode, the card's address and the
 * addresses the asker sent. Code writes all of it; the member's words never
 * reach it (addresses are checked to be addresses).
 */
export function answerContext(req: AnswerRequest): string {
  const lang: Locale = isLocale(req.lang) ? req.lang : "en";
  const card = addressOf(req.cardAddress);
  const asker = askableOf({ askerAddresses: req.askerAddresses, cardAddress: null });
  const lines = [
    "Context for this question, from the bot's code:",
    DATE.test(req.date) ? `- Today's date: ${req.date} (UTC).` : null,
    `- Language: the member's question decides it when it is one of the site's 12; otherwise reply in ${localeName(lang)} (${lang}), their app's language.`,
    req.chat === "private"
      ? "- Chat: a private chat with one member. Keep the reply under 900 characters."
      : "- Chat: tonkfun.fun's community group, where many people read. Keep the reply under 600 characters and 6 lines.",
    req.mode === "proactive"
      ? "- Mode: unprompted. Nobody asked you. Answer only if the knowledge pack or a tool answers it; otherwise set answered to false and leave reply empty."
      : "- Mode: asked. The member asked you directly.",
    card ? `- The member replied to the card of the token ${card}.` : "- The member didn't reply to a token's card.",
    asker.length > 0 ? `- Token addresses in the member's message: ${asker.join(", ")}.` : "- The member's message holds no token address.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
