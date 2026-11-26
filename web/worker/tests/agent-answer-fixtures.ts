import type Anthropic from "@anthropic-ai/sdk";
import type { AnswerDeps } from "../src/telegram/agent/answer";
import type { AgentData, AnswerOutput, AnswerRequest, LaunchFigures, Pack, PackSource, ToolToken } from "../src/telegram/agent/types";
import { PRICES } from "../src/telegram/claude/prices";
import type { AnswerModel, ClaudeClient } from "../src/telegram/claude/types";
import type { OfficialAccounts } from "../src/telegram/community/types";
import { claudeMessage, openBudget, textBlock, toolUseBlock } from "./community-fixtures";
import { NOW } from "./fixtures";

/**
 * Fakes for the answer loop's tests (agent-answer*.test.ts, agent-prompt*.test.ts,
 * agent-tools.test.ts): a small knowledge pack, the official accounts, a
 * question, the model's replies and the tools' data. Nothing here touches
 * the network.
 */

/** The launchpad's address on Robinhood Chain mainnet, as the pack holds it. */
export const LAUNCHPAD = "0xbCaF0eCF36D15622a13D04b5ac58d312818BB4f0";
export const WHOA = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
export const SOL_MINT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
/** A pseudonymous code as claude/user-code.ts makes it. */
export const CODE = "0123456789abcdef0123456789abcdef";
export const EMAIL = { kind: "email", text: "security@tonkfun.fun", href: "mailto:security@tonkfun.fun" } as const;

export const OFFICIAL: OfficialAccounts = {
  bot: ["TonkfunBot"],
  channel: "tonkfun_launches",
  groups: ["tonkfun_chat"],
  x: ["tonkfun"],
  site: "https://www.tonkfun.fun",
};

/** A pack like buildKnowledge's, much smaller: tagged blocks, a glossary per language, the record's address. */
export function pack(overrides: Partial<Pack> = {}): Pack {
  return {
    core: "[docs.fees] Fees\nEvery buy and sale on the curve pays a fixed 1% protocol fee to tonkfun.fun.\n\n[docs.tax] The launch-block tax\nIn the launch block and the next one, every buy pays a 99% tax.",
    glossary: { en: "[glossary.en] English: the site's own words.\n- Fees", es: "[glossary.es] Español: the site's own words.\n- Fees = Comisiones" },
    hash: "a".repeat(64),
    addresses: [LAUNCHPAD],
    site: { hash: "a".repeat(64), inviteOnly: true, contact: EMAIL, readAt: NOW },
    ...overrides,
  };
}

export const packSource = (current: Pack = pack()): PackSource => ({
  current: () => current,
  refresh: async () => undefined,
  contact: () => "set",
  health: () => ({}),
});

/** A question asked directly in the group. */
export const request = (overrides: Partial<AnswerRequest> = {}): AnswerRequest => ({
  question: "How much is the protocol fee on a curve trade?",
  earlierAnswer: null,
  cardAddress: null,
  askerAddresses: [],
  lang: "en",
  chat: "group",
  mode: "direct",
  lane: "group",
  date: "2026-11-06",
  userCode: CODE,
  ...overrides,
});

/** The model's answer, as the schema asks for it. */
export const answerJson = (overrides: Partial<AnswerOutput> = {}): AnswerOutput => ({
  language: "en",
  answered: true,
  reply: "On fees: every curve trade pays a fixed 1% protocol fee to tonkfun.fun.",
  links: ["docs_fees"],
  token: "",
  escalate: "none",
  admin_note: "",
  ...overrides,
});

/** A finished reply holding `text` (a thinking block first, as Haiku 5.5 sends). */
export const endTurn = (text: string = JSON.stringify(answerJson())): Anthropic.Message => claudeMessage({ content: [textBlock(text)], stop_reason: "end_turn" });

/** A reply asking for tools. */
export const toolTurn = (...uses: Array<Record<string, unknown>>): Anthropic.Message => claudeMessage({ content: uses, stop_reason: "tool_use" });

export const getTokenUse = (address: string, id = "toolu_token") => toolUseBlock("get_token", { address }, id);
export const figuresUse = (id = "toolu_figures") => toolUseBlock("launchpad_figures", {}, id);

/** Whoa the Tarsier as get_token returns it. */
export const TOOL_TOKEN: ToolToken = {
  address: WHOA,
  name: "Whoa 77%",
  ticker: "WHOA",
  nameHidden: false,
  launchpad: "tonkfun.fun",
  chain: "Robinhood Chain",
  score: 78,
  level: "Safe",
  badges: ["Locked", "Crew 2%", "Block-0 Shield"],
  marketCapUsd: 21_400,
  change24h: 12.4,
  curvePct: 41,
  graduated: false,
  holders: 37,
  ageMinutes: 7_200,
  launch: { lockPct: 100, lockKind: "time", lockEnds: "2027-05-19", claimablePct: 0, crewPct: 2, creatorPct: 0, shield: true },
};

/** The figures the Docs page shows for the deployed settings. */
export const FIGURES: LaunchFigures = {
  launchFee: "0.005 ETH",
  startReserves: "1 ETH and 1,073,000,000 tokens, virtual",
  startCap: "0.93 ETH",
  graduation: "After about 2.93 ETH net into the curve",
  graduationCap: "At a market cap of about 14.4 ETH",
  paused: false,
  usd: { launchFee: "≈ $15.00", startCap: "≈ $2.8K", graduationCap: "≈ $43.2K" },
  readAt: "2026-11-06T12:00:00Z",
};

/** Tools' data with one token and the figures; `reads` records every address asked for. */
export function fakeData(token: ToolToken | null = TOOL_TOKEN, figures: LaunchFigures | null = FIGURES): AgentData & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    token: (address) => {
      reads.push(address);
      return token && address.toLowerCase() === token.address.toLowerCase() ? token : null;
    },
    figures: async () => figures,
  };
}

type OpenBudget = ReturnType<typeof openBudget>;

/**
 * The loop's dependencies: an open budget, the small pack, the fake data, a
 * fixed clock and Haiku 5.5 unless given. The loop's own tests pin Haiku's
 * settings, which haven't changed; agent-answer-models.test.ts runs the
 * same loop on Sonnet 5.5 (the bot's default) and Opus 5.5.
 */
export function deps(client: ClaudeClient, extra: Partial<Omit<AnswerDeps, "budget">> & { budget?: OpenBudget } = {}): AnswerDeps & { budget: OpenBudget } {
  return { client, pack: packSource(), data: fakeData(), official: OFFICIAL, now: () => NOW, model: "claude-haiku-5-5", ...extra, budget: extra.budget ?? openBudget() };
}

/**
 * An answer request's worst case worked out by hand, as the ledger must
 * reserve it (model#3): one token per 2 characters of the request, rounded
 * up, plus the 286 tokens of the tool prompt, at the 1-hour cache-write
 * rate, plus max_tokens at the output rate.
 */
export function worstByHand(params: object, model: AnswerModel, maxTokens: number): number {
  const { write1h, output } = PRICES[model].card;
  return ((Math.ceil(JSON.stringify(params).length / 2) + 286) * write1h + maxTokens * output) / 1e6;
}
