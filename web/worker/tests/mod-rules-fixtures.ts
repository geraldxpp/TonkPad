import type { AllowList, RuleCategory } from "../src/telegram/community/types";
import { checkMessage, type RuleInput } from "../src/telegram/mod/rules";
import type { TgMessageEntity } from "../src/telegram/types";

/** The rules tests' group: its allow-list, one admin, the bot, and a knowledge-pack address. */
export const ALLOW: AllowList = {
  domains: ["tonkfun.fun", "tonk-pad.vercel.app", "robinhoodchain.blockscout.com", "solscan.io", "explorer.solana.com"],
  telegram: ["tonkfunbot", "tonkfun_launches", "tonkfun_chat"],
  x: ["tonkfun"],
};
export const PACK = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
export const WHOA = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
/** BIP-39's own test vector (16 bytes of 0x7f): a valid 12-word phrase. */
export const EN_12 = "legal winner thank year wave sausage worth useful legal winner thank yellow";
export const TX_HASH = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";

/** A member's fresh message in normal mode; `extra` overrides any field. */
export function input(text: string, extra: Partial<RuleInput> = {}): RuleInput {
  return {
    text, entities: [], standing: "member", strictness: "normal", raid: false, edited: false, addedLinks: null, ageSeconds: 3,
    forwarded: false, forwardName: null, externalOtherChat: false, viaButtons: false, riskyFile: false,
    sender: { name: "Sam", username: "sam_doe", tag: null }, admins: [{ name: "Alex Admin", username: "alex_admin" }],
    bot: ["TonkfunBot"], allow: ALLOW, packAddresses: new Set([PACK]), trustedName: false, ...extra,
  };
}

export const check = (text: string, extra: Partial<RuleInput> = {}) => checkMessage(input(text, extra));
/** The hits' categories, sorted. */
export const cats = (text: string, extra: Partial<RuleInput> = {}) => check(text, extra).hits.map((h) => h.category).sort();
export const hit = (text: string, category: RuleCategory, extra: Partial<RuleInput> = {}) => check(text, extra).hits.find((h) => h.category === category);
/** Whether any hit punishes (a scam or an offence). */
export const punishes = (text: string, extra: Partial<RuleInput> = {}) => check(text, extra).hits.some((h) => h.severity === "offence" || h.severity === "scam");
/** A url entity over the first occurrence of `part`, as Telegram marks it. */
export const urlEntity = (text: string, part: string): TgMessageEntity => ({ type: "url", offset: text.indexOf(part), length: part.length });
