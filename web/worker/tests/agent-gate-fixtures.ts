import { gateAnswer, type GateInput, type Gated } from "../src/telegram/agent/gate";
import type { AnswerOutput } from "../src/telegram/agent/types";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";

/** The launchpad's address on Robinhood Chain mainnet, with its checksum capitals, as the pack holds it. */
export const LAUNCHPAD = "0xbCaF0eCF36D15622a13D04b5ac58d312818BB4f0";
/** One character off: a scammer's look-alike contract. */
export const LOOKALIKE = "0xbCaF0eCF36D15622a13D04b5ac58d312818BB4f1";
export const PLACEHOLDER = "(an address I can't verify)";
/** Safe, Caution and Risky in every language, from the module-14 dictionaries. */
export const LEVEL_WORDS = Object.values(BOT_DICTIONARIES).flatMap((d) => Object.values(d.levels));

/** A slice of the pack and a get_token result, joined as the answer loop joins its facts. */
export const FACTS = [
  "Every buy and sale on the curve pays a fixed 1% protocol fee to tonkfun.fun.",
  "A curve trade made through someone's referral link pays them 25% of the protocol fee: 0.25% of the trade.",
  "Every separate buy in the launch block and the next one pays a 99% tax.",
  "No Crew fee is charged until eligible holders own at least 10 million tokens: 1% of supply.",
  `The launchpad: ${LAUNCHPAD}`,
  JSON.stringify({ launchFee: "0.042 ETH", marketCapUsd: 21_400, curvePct: 41, holders: 37, score: 78, change24h: -12.4 }),
].join("\n");

export const output = (reply: string, extra: Partial<AnswerOutput> = {}): AnswerOutput => ({
  reply,
  language: "en",
  links: [],
  token: "",
  escalate: "none",
  admin_note: "",
  answered: true,
  ...extra,
});

/** The gate for a group answer over FACTS, allowing the launchpad's address; `input` and `out` override any field. */
export function gate(reply: string, input: Partial<GateInput> = {}, out: Partial<AnswerOutput> = {}): Gated {
  return gateAnswer({
    output: output(reply, out),
    facts: FACTS,
    allowedAddresses: new Set([LAUNCHPAD]),
    chat: "group",
    placeholder: PLACEHOLDER,
    levelWords: LEVEL_WORDS,
    ...input,
  });
}

/** Every printable ASCII character as its full-width form ("９９％"), the way a model or a member might type it. */
export const fullWidth = (text: string) =>
  [...text].map((c) => (c >= "!" && c <= "~" ? String.fromCodePoint((c.codePointAt(0) ?? 0) + 0xfee0) : c)).join("");
