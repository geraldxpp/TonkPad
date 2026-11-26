import type { Locale } from "@/shared/i18n/config";
import type { Lane } from "../claude/types";
import type { Escalation } from "../community/types";

/**
 * The answer agent's contracts: the knowledge pack it answers from, what the
 * model returns, and the read-only data its two tools read.
 */

/** What the site's GET /api/bot/site says, validated: no other text from the site reaches the model. */
export interface SiteFacts {
  /** The deployed site's knowledge hash; a mismatch with the worker's means the worker needs a redeploy. */
  hash: string;
  /** Whether Launch is invite-only (never the list); null when the site didn't say. */
  inviteOnly: boolean | null;
  /** The Security page's contact, or null when it has none. */
  contact: { kind: "email" | "link"; text: string; href: string } | null;
  readAt: number;
}

/** The knowledge pack, built in the worker from its own checkout. */
export interface Pack {
  /** The English core: Docs, Security and privacy pages, reviewed feature strings, contracts and code facts. */
  core: string;
  /** A short glossary per language (section titles, FAQ questions, labels), so terms match the site. */
  glossary: Partial<Record<Locale, string>>;
  hash: string;
  /** Every address the pack names (MAINNET_RECORD): the only addresses an answer may show besides tool results. */
  addresses: readonly string[];
  site: SiteFacts | null;
}

export interface PackSource {
  current(): Pack;
  /** Reads /api/bot/site again (at start and every 30 minutes). */
  refresh(now: number): Promise<void>;
  /** Whether the site has a Security contact: "unknown" while the site can't be reached. */
  contact(): "set" | "none" | "unknown";
  health(): Record<string, unknown>;
}

/** The pages an answer may link to, as buttons code builds; the model names only these keys. */
export const LINK_KEYS = [
  "docs",
  "docs_about",
  "docs_launching",
  "docs_curve",
  "docs_fees",
  "docs_locks",
  "docs_crew",
  "docs_tax",
  "docs_score",
  "docs_safety",
  "docs_faq",
  "launch",
  "explore",
  "swap",
  "bridge",
  "portfolio",
  "security",
  "privacy",
  "launches",
  "referral",
] as const;
export type LinkKey = (typeof LINK_KEYS)[number];

/** The model's answer, as its JSON schema asks (agent/schema.ts validates it). */
export interface AnswerOutput {
  reply: string;
  language: Locale;
  links: LinkKey[];
  /** The token address the answer is about, or "". */
  token: string;
  escalate: Escalation | "none";
  /** A one-line note for the admins when escalating, or "". */
  admin_note: string;
  /** Whether the pack or a tool answered it: an unprompted answer is sent only when true. */
  answered: boolean;
}

export interface AnswerRequest {
  /** The question, cleaned and masked, at most 600 characters. */
  question: string;
  /** The bot's own answer being replied to (at most 1,000 characters), or null. */
  earlierAnswer: string | null;
  /** The address on the card being replied to, or null. */
  cardAddress: string | null;
  /** Addresses the asker sent: the only ones get_token reads. */
  askerAddresses: string[];
  lang: Locale;
  chat: "group" | "private";
  mode: "direct" | "proactive";
  lane: Lane;
  /** Today's UTC date, "YYYY-MM-DD", for the system message (never the system prompt). */
  date: string;
  /** The pseudonymous metadata.user_id, or null when the user code is off. */
  userCode: string | null;
}

/** A token as get_token returns it: no wallets, metadata texts, agent brief or art. */
export interface ToolToken {
  address: string;
  /** Set by the token's creator: cleaned, and untrusted. */
  name: string;
  ticker: string;
  /** The name was hidden (a brand claim, a link or handle, an airdrop or support offer). */
  nameHidden: boolean;
  launchpad: string;
  chain: string;
  score: number;
  level: "Safe" | "Caution" | "Risky";
  badges: string[];
  marketCapUsd: number | null;
  change24h: number | null;
  /** Bonding-curve progress in percent, or null when unknown. */
  curvePct: number | null;
  graduated: boolean;
  holders: number | null;
  ageMinutes: number;
  /** A tonkfun.fun launch's own facts. */
  launch: {
    lockPct: number | null;
    lockKind: "time" | "linear" | "none" | null;
    /** When the lock ends, as the tool writes it, or null. */
    lockEnds: string | null;
    claimablePct: number | null;
    crewPct: number | null;
    creatorPct: number | null;
    shield: boolean;
  } | null;
}

export type AnswerResult =
  | { kind: "answer"; output: AnswerOutput; facts: string; addresses: string[]; token: ToolToken | null }
  | { kind: "declined"; reason: "refusal" | "max_tokens" | "invalid" }
  | { kind: "unavailable"; reason: "budget" | "error" | "timeout" | "too_long" };

/** The launchpad's figures as the Docs page shows them (its own formatters), and when they were read. */
export interface LaunchFigures {
  launchFee: string;
  startReserves: string;
  startCap: string;
  graduation: string;
  graduationCap: string;
  paused: boolean;
  /** Dollar values at the worker's ETH price, or null without one. */
  usd: { launchFee: string; startCap: string; graduationCap: string } | null;
  readAt: string;
}

/** What the tools read: the worker's tokens (never marking one opened) and the launchpad's figures. */
export interface AgentData {
  token(address: string): ToolToken | null;
  figures(): Promise<LaunchFigures | null>;
}
