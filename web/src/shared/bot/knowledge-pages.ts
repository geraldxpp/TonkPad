import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { MAINNET_RECORD } from "@/shared/tonk/mainnet-record";
import { explorerAddressUrl, type TonkNetwork } from "@/shared/tonk/networks";
import { CODE_FACTS } from "./knowledge-facts";
import { KNOWLEDGE_GROUPS, type KnowledgeLine, linePaths } from "./knowledge-facts-groups";
import { block, item, sub, term, textAt } from "./knowledge-text";

/** The bot's display name and handle, as the privacy page fills them (BOT in modules/privacy/lib/bot.ts; a test holds them equal). */
export const BOT_NAMES = { bot: "TonkFun", handle: "@TonkfunBot" } as const;

/**
 * Who runs the bot, once the owner gives a legal name (BOT.operator in
 * modules/privacy/lib/bot.ts, which shared/ can't import; a test holds the
 * two equal). Null while it is the team, written in each language's words
 * (privacy.rights.team).
 */
export const BOT_OPERATOR: string | null = null;

/** The deployment record's contracts, in the Docs page's order; the Safe last. */
export const RECORD_IDS = ["launchpad", "migrator", "guard", "tokenFactory", "safe"] as const;

/**
 * The Security page: how to report a flaw, the scope, the rules, the rewards
 * by severity and what was checked. The contact itself comes from the site
 * (/api/bot/site), and the reward amounts and file hashes are left to the page.
 */
export function securityBlock(t: Dictionary): string {
  const { report: r, scope: sc, rules: ru, rewards: rw, checked: c } = t.security;
  return block("security", `${t.security.eyebrow} · ${t.security.title}`, [
    t.security.subtitle,
    sub(r.title),
    r.privately,
    sub(r.includeTitle),
    ...[r.location, r.impact, r.steps, r.you].map(item),
    sub(r.expectTitle),
    r.expect,
    sub(sc.title),
    sc.intro,
    ...[sc.launchpad, sc.migrator, sc.guard].map(item),
    sub(sc.outTitle),
    ...[sc.hosting, sc.thirdParty, sc.social].map(item),
    sub(ru.title),
    ...[ru.funds, ru.noDos, ru.disclosure].map(item),
    sub(ru.harbourTitle),
    ru.harbour,
    sub(rw.title),
    rw.intro,
    term(rw.critical, rw.criticalBody),
    term(rw.high, rw.highBody),
    term(rw.medium, rw.mediumBody),
    term(rw.low, rw.lowBody),
    sub(c.title),
    c.intro,
    ...[c.reviews, c.static, c.fuzzing, c.proofs, c.attacks, c.rehearsal, c.testnet].map(item),
  ]);
}

/**
 * The bot's own privacy policy, as /privacy/telegram shows it: its names
 * filled in, the operator in rights.who (never rights.team on its own line),
 * and no date or link labels.
 */
export function privacyBlock(t: Dictionary): string {
  const p = t.privacy;
  const { reads, ai, keeps, never, rights } = p;
  const filled = (text: string) => fmt(text, { ...BOT_NAMES, operator: BOT_OPERATOR ?? rights.team });
  return block("privacy", `${p.eyebrow} · ${p.title}`, [
    filled(p.subtitle),
    sub(reads.title),
    reads.intro,
    ...[reads.private, reads.community, reads.groups, filled(reads.inline), reads.buttons].map(item),
    reads.profile,
    sub(ai.title),
    ...[ai.who, ai.sent, ai.code, ai.retention, ai.secrets, ai.wrong, ai.decisions],
    sub(keeps.title),
    keeps.nothing,
    ...[keeps.memory, keeps.wallet].map(item),
    keeps.communityIntro,
    ...[keeps.warnings, keeps.newcomers, keeps.checks, keeps.trusted, keeps.reviews, keeps.cleanup].map(item),
    ...[keeps.left, keeps.admins, keeps.counts],
    sub(never.title),
    ...[never.keys, never.sign, never.dm].map(item),
    never.site,
    sub(rights.title),
    ...[filled(rights.who), rights.why, rights.recipients, rights.choose, rights.ask],
    sub(p.channel.title),
    p.channel.body,
    sub(p.telegram.title),
    p.telegram.body,
    sub(p.questions.title),
    p.questions.body,
  ]);
}

/** Sentences side by side; labels such as alert names joined with "; ". */
function joined(texts: readonly string[]): string {
  return texts.filter(Boolean).reduce((all, text) => (all === "" ? text : `${all}${/[.?!]$/.test(all) ? " " : "; "}${text}`), "");
}

/** One feature line: the message, or "term: text". */
function featureLine(t: Dictionary, line: KnowledgeLine): string {
  if (typeof line === "string") return item(textAt(t, line));
  return term(textAt(t, line[0]), joined(linePaths(line[1]).map((path) => textAt(t, path))));
}

/** The reviewed feature strings, one block per screen ([features.swap] Swap). */
export function featureBlocks(t: Dictionary): string[] {
  return KNOWLEDGE_GROUPS.map((group) => block(`features.${group.id}`, textAt(t, group.title), group.lines.map((line) => featureLine(t, line))));
}

/**
 * The mainnet contracts and their owner, each with its Blockscout page (the
 * verified source, or the Safe's address page), as the Docs page links them.
 */
export function contractsBlock(t: Dictionary, network: TonkNetwork | null): string {
  const s = t.docs.safety;
  return block(
    "contracts",
    s.contractsTitle,
    RECORD_IDS.map((id) => {
      const address = MAINNET_RECORD[id];
      if (!network) return term(s[id], address);
      const page = explorerAddressUrl(network, address);
      return term(s[id], `${address} · ${id === "safe" ? page : `${page}?tab=contract`}`);
    }),
  );
}

/** The facts only the code states (knowledge-facts.ts). */
export function factsBlock(): string {
  return block("facts", "From the site's code", CODE_FACTS.map(item));
}
