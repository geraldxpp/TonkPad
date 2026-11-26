import { domainToUnicode } from "node:url";
import { claimsBrand } from "../channel";

/**
 * Folding text so look-alikes compare equal, edit distance, and the brand
 * look-alike rule for domains. Kept apart from names.ts so links.ts can use
 * it without an import cycle; names.ts re-exports fold and brandLookalike.
 */

/**
 * Letters that pass for others. First the channel's own (telegram/channel.ts,
 * where "Тонк" reads "Tonk"), then more Cyrillic and Greek letters, small
 * capitals, and the digits people swap for letters.
 */
const LOOKALIKES: Readonly<Record<string, string>> = {
  τ: "t", т: "t", ᴛ: "t", ο: "o", о: "o", ᴏ: "o", "0": "o", ν: "n", η: "n", п: "n", н: "n", ɴ: "n", κ: "k", к: "k", ᴋ: "k",
  а: "a", в: "b", г: "r", е: "e", і: "i", ј: "j", м: "m", р: "p", с: "c", у: "y", х: "x", ѕ: "s", ԁ: "d", ӏ: "l", ԛ: "q", ԝ: "w", һ: "h", ь: "b", ш: "w",
  α: "a", β: "b", γ: "y", ε: "e", ι: "i", μ: "u", ρ: "p", σ: "o", υ: "u", χ: "x", ω: "w", π: "n",
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ʟ: "l", ᴍ: "m", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z",
  "1": "l", "3": "e", "4": "a", "5": "s", "7": "t",
};
const MARKS = /[\p{M}\p{Default_Ignorable_Code_Point}]/gu;

/**
 * Text as the impersonation and brand rules compare it: NFKD (so 𝐓𝐨𝐧𝐤 and
 * ｔｏｎｋ are tonk), accents and invisible characters dropped, lower case,
 * look-alike letters and digits mapped, "rn" read as m and "vv" as w, and
 * anything but letters and digits turned into single spaces.
 */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(/./gu, (c) => LOOKALIKES[c] ?? c)
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** fold without the spaces: how a username or a run-together name reads. */
export const compact = (text: string) => fold(text).replace(/ /g, "");

/** Edits (insert, delete, replace, swap two neighbours) between two strings, counting characters, not UTF-16 units. */
export function editDistance(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  let before: number[] = [];
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    for (let j = 1; j <= t.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d = Math.min(d, before[j - 2] + 1);
      row.push(d);
    }
    before = prev;
    prev = row;
  }
  return prev[t.length];
}

/** Whether two strings are at most `max` edits apart (cheap when their lengths already differ by more). */
export const within = (a: string, b: string, max: number) => Math.abs([...a].length - [...b].length) <= max && editDistance(a, b) <= max;

/** A host as the link rules compare it: lower case, Unicode form (not punycode), no trailing dot, no "www.". */
export function normalHost(raw: string): string {
  const lower = raw.trim().toLowerCase();
  let end = lower.length;
  while (end > 0 && lower[end - 1] === ".") end--;
  const host = lower.slice(0, end);
  return (domainToUnicode(host) || host).replace(/^www\./, "");
}

/** The host itself or one of its subdomains. */
export const under = (host: string, domains: readonly string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** Ordinary words close to the brand ("tonkin" is a region, "tonka" a toy, "thinkpad" a laptop). */
export const NOT_BRAND = new Set(["tonka", "tonkatsu", "tonkotsu", "tonkin", "tonks", "tankful", "thinkpad"]);
const STEMS = ["tonkfun", "tonkpad"];

/**
 * Each brand a look-alike may copy, with its own domains (and their
 * subdomains), which never count. tonkfun.fun's own are the allow-list's;
 * robinhoodchain.blockscout.com is Robinhood Chain's explorer, and
 * letsbonk.fun is Bonk.fun's launchpad.
 */
const OWN: Readonly<Record<string, readonly string[]>> = {
  robinhood: ["robinhood.com", "robinhoodchain.blockscout.com"],
  metamask: ["metamask.io"],
  uniswap: ["uniswap.org"],
  blockscout: ["blockscout.com"],
  phantom: ["phantom.com", "phantom.app"],
  pumpfun: ["pump.fun"],
  bonkfun: ["bonk.fun", "letsbonk.fun"],
  solscan: ["solscan.io"],
  dexscreener: ["dexscreener.com"],
};
const TONKFUN_OWN = ["tonkfun.fun", "tonk-pad.vercel.app"];

/** An e-mail address at the team's own domains (the Security contact): official, never a member's private address. */
export function teamAddress(address: string): boolean {
  const at = address.lastIndexOf("@");
  return at > 0 && under(normalHost(address.slice(at + 1)), TONKFUN_OWN);
}

/**
 * A domain posing as tonkfun.fun or a brand its members use. tonkfun.fun:
 * a label that claims the brand by the channel's word rule (claimsBrand), or
 * that folds to within two edits of tonkfun or tonkpad, or holds either (in
 * a label or across them, as tonk.fun.xyz). Robinhood, MetaMask, Uniswap,
 * Blockscout, Phantom, Pump.fun, Bonk.fun, Solscan and DEX Screener: the
 * folded host holds the name while it isn't that brand's own domain. Hyphens
 * and dots don't hide a name, nor do Cyrillic letters, punycode or a 0 for
 * an o.
 */
export function brandLookalike(domain: string): boolean {
  const host = normalHost(domain);
  if (host === "" || under(host, TONKFUN_OWN)) return false;
  const labels = host.split(".");
  for (const label of labels.length > 1 ? labels.slice(0, -1) : labels) {
    if (claimsBrand(label, "")) return true;
    const name = compact(label);
    if (!NOT_BRAND.has(name) && STEMS.some((stem) => name.includes(stem) || within(name, stem, 2))) return true;
  }
  const joined = compact(host);
  if (STEMS.some((stem) => joined.includes(stem))) return true;
  return Object.entries(OWN).some(([brand, own]) => joined.includes(brand) && !under(host, own));
}
