import { createHash } from "node:crypto";
import { type Locale, LOCALES, localeName } from "@/shared/i18n/config";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { MAINNET_RECORD } from "@/shared/tonk/mainnet-record";
import { mainnetNetwork } from "@/shared/tonk/networks";
import { docsBlocks } from "./knowledge-docs";
import { GLOSSARY_KEYS } from "./knowledge-facts";
import { contractsBlock, factsBlock, featureBlocks, privacyBlock, RECORD_IDS, securityBlock } from "./knowledge-pages";
import { item, textAt } from "./knowledge-text";

export { KNOWLEDGE_SECTIONS } from "./knowledge-docs";

/**
 * What the Telegram bot knows about tonkfun.fun (prompts/15-community-agent.md,
 * "The knowledge pack"), built from the site's own text: the English core,
 * a glossary per language, and the only addresses an answer may show.
 */
export interface Knowledge {
  v: 1;
  /** sha256 of this object's JSON without the hash: the worker and the site compare theirs. */
  hash: string;
  /** English: the Docs page, the Security page, the bot's privacy page, reviewed feature strings, the contracts and the code's facts. */
  core: string;
  /** The site's own words for its terms in each language, English included. */
  glossary: Record<Locale, string>;
  /** The deployment record's five addresses, checksum case: the launchpad, migrator, guard, token factory and Safe. */
  addresses: string[];
}

/** The site's words for its terms in `lang`, after the English they translate; English lists them alone. */
function glossaryFor(lang: Locale): string {
  const local = DICTIONARIES[lang];
  const english = DICTIONARIES.en;
  const head =
    lang === "en"
      ? `[glossary.en] ${localeName(lang)}: the site's own words for its terms.`
      : `[glossary.${lang}] ${localeName(lang)}: the site's own words for its terms, after the English they translate (English = ${localeName(lang)}).`;
  const lines = GLOSSARY_KEYS.map((path) => (lang === "en" ? item(textAt(english, path)) : item(`${textAt(english, path)} = ${textAt(local, path)}`)));
  return [head, ...lines.filter(Boolean)].join("\n");
}

/**
 * The knowledge pack. Pure and deterministic: it reads the dictionaries,
 * the deployment record and the network helpers only (never the environment,
 * the clock or the network), so the worker and the site build the same pack,
 * byte for byte, from the same checkout, and its hash says so.
 */
export function buildKnowledge(): Knowledge {
  const t = DICTIONARIES.en;
  // The record's own network, named explicitly: this build's environment never changes the pack.
  const network = mainnetNetwork({ launchpad: MAINNET_RECORD.launchpad, migrator: MAINNET_RECORD.migrator, block: String(MAINNET_RECORD.block) });
  const core = [...docsBlocks(t, network?.name ?? null), securityBlock(t), privacyBlock(t), ...featureBlocks(t), contractsBlock(t, network), factsBlock()].join("\n\n");
  const glossary = Object.fromEntries(LOCALES.map(({ code }) => [code, glossaryFor(code)])) as Record<Locale, string>;
  const addresses: string[] = RECORD_IDS.map((id) => MAINNET_RECORD[id]);
  const body = { v: 1 as const, core, glossary, addresses };
  return { ...body, hash: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}
