import type Anthropic from "@anthropic-ai/sdk";
import type { OfficialAccounts, TriageInput, TriageVerdict } from "../src/telegram/community/types";
import { claudeMessage, textBlock } from "./community-fixtures";

/** The official accounts of the rules tests' group (mod-rules-fixtures ALLOW): the bot, the channel, the group, X and the site. */
export const OFFICIAL: OfficialAccounts = {
  bot: ["TonkfunBot"],
  channel: "tonkfun_launches",
  groups: ["tonkfun_chat"],
  x: ["tonkfun"],
  site: "https://www.tonkfun.fun",
};

/** A verdict exactly as the schema asks for it: a member's question about tonkfun.fun. */
export const VALID: TriageVerdict = {
  reason: "Asks how the launch fee works",
  verdict: "ok",
  category: "none",
  question: "tonkfun",
  needs_human: "none",
  dm_scam_mention: false,
  language: "en",
};

/** A member's message as the pipeline hands it to the check: masked, cut and flagged; no ID, name or username. */
export const INPUT: TriageInput = {
  text: "How much does it cost to launch a token?",
  edited: false,
  forwarded: false,
  standing: "member",
  domains: [],
  handles: 0,
  addresses: 0,
  replyToBot: false,
  appLang: "en",
};

/** Haiku's reply with thinking off: one text block holding `text`, as structured output returns it. */
export const verdictReply = (text: string, stop_reason = "end_turn"): Anthropic.Message =>
  claudeMessage({ content: [textBlock(text)], stop_reason, thinking: false });
