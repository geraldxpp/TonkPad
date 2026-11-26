import { LAUNCHPADS } from "@/shared/config/launchpads";
import { en } from "@/shared/i18n/dictionaries/en";
import type { LaunchpadId } from "@/shared/types/launchpad";
import { KNOWLEDGE_SECTIONS } from "./knowledge-docs";
import { KNOWLEDGE_GROUPS, linePaths } from "./knowledge-facts-groups";
import { listed } from "./knowledge-text";

/**
 * What the bot's knowledge pack takes from the site beyond the Docs,
 * Security and privacy pages, and the facts only the code states
 * (prompts/15-community-agent.md, "What it knows"). Each list is reviewed
 * by hand; tests hold every path to the 12 dictionaries and every fact to
 * its constant.
 */

/** Every dictionary path the feature blocks read (headings included), beyond docs.*, security.* and privacy.*. */
export const KNOWLEDGE_KEYS: readonly string[] = KNOWLEDGE_GROUPS.flatMap((group) => [
  group.title,
  ...group.lines.flatMap((line) => (typeof line === "string" ? [line] : [line[0], ...linePaths(line[1])])),
]);

/** The site's own words for its terms, in each language: Docs section titles, FAQ questions, figure labels, screens, badges, levels and reviews. */
export const GLOSSARY_KEYS: readonly string[] = [
  ...KNOWLEDGE_SECTIONS.map((id) => `docs.${id}.title`),
  ...Object.keys(en.docs.faq.questions).map((id) => `docs.faq.questions.${id}`),
  ...["fee", "reserves", "startCap", "graduation", "status", "reserveNow", "maxCurve"].map((id) => `docs.figures.${id}`),
  ...["explore", "swap", "bridge", "portfolio", "alerts", "launch", "docs"].map((id) => `nav.${id}`),
  "meta.security",
  "meta.privacy",
  ...["locked", "agent", "hot", "new", "graduated", "rwa"].map((id) => `badges.${id}`),
  "launch.preview.shield",
  "score.Safe",
  "score.Caution",
  "score.Risky",
  "table.score",
  "tabs.locked",
  "launch.economics.crewTitle",
  "launch.economics.creatorTitle",
  "launch.economics.tierStandard",
  "launch.economics.tierIronclad",
  "launch.lock.time",
  "launch.lock.linear",
  "launch.lock.none",
  "launch.steps.agent",
  "launch.basics.devBuy",
  "mission.poolFees.share",
  "mission.creator.extend",
  "mission.creator.edit",
  "swap.reviewTitle",
  "launch.review.title",
  "bridge.review.title",
];

/** The Bridge screen's networks, in its own order (BRIDGE_NETWORKS in modules/bridge/lib/networks.ts; a test holds the two equal). */
export const BRIDGE_NETWORK_NAMES: readonly string[] = [
  "Base",
  "Ethereum",
  "Arbitrum",
  "Robinhood Chain",
  "Solana",
  "Optimism",
  "Polygon",
  "BNB Chain",
  "Avalanche",
  "Unichain",
  "Linea",
  "Ink",
  "World Chain",
  "Monad",
  "HyperEVM",
  "ZKsync Era",
  "Scroll",
];

/**
 * The launchpads the worker follows, in the order it ingests them (INGESTING
 * in worker/src/main.ts; a test holds them to ALERT_LAUNCHPADS, the shared
 * list of the launchpads the worker follows).
 */
export const FOLLOWED_LAUNCHPAD_IDS: readonly LaunchpadId[] = ["tonk", "pons", "pump", "bonk"];

/** Their names: tonkfun.fun, Pons, Pump.fun and Bonk.fun. */
export const FOLLOWED_LAUNCHPADS: readonly string[] = FOLLOWED_LAUNCHPAD_IDS.map((id) => LAUNCHPADS[id].name);

/**
 * What only the code states, one English line each: the swap fee (FEE_BPS in
 * shared/swap/server/config.ts), legacy transactions on Robinhood Chain
 * mainnet (shared/wallet/fees.ts), the Bridge's networks and the launchpads
 * followed. Change a line with its constant; the tests fail until both agree.
 */
export const CODE_FACTS: readonly string[] = [
  "Swaps on tonkfun.fun pay tonkfun.fun a 1% fee, shown as the tonkfun.fun fee before you confirm: on the Swap screen, and with Buy and Sell on the page of a token from another launchpad. A tonkfun.fun launch traded on its bonding curve, or in its Uniswap pool after graduation, pays that token's own fees instead, as Fees explains.",
  "On Robinhood Chain mainnet the site sends every transaction in the legacy format, priced at twice the latest base fee, which MetaMask sends the ordinary way. The chain charges only the base fee, so the margin costs nothing.",
  `Bridge moves major assets between ${BRIDGE_NETWORK_NAMES.length} networks: ${listed(BRIDGE_NETWORK_NAMES)}.`,
  `The site's live data follows new tokens from ${listed(FOLLOWED_LAUNCHPADS)}: Explore lists them, and Alerts can watch their graduations and hot launches.`,
];
