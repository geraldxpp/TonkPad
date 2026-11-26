import { createPrivateKey, createPublicKey } from "node:crypto";
import type { TgMessageEntity } from "../types";
import { maskContacts, maskMarked } from "./secrets-contacts";
import { KEY_WORDS, matchesAny } from "./words";
import { findSeed, MASK_RUN, seedRuns, tokens } from "./secrets-seed";

/**
 * Recovery phrases and private keys in a message. A message holding one is
 * removed and never sent to Anthropic; maskForModel hides anything key-like,
 * and any e-mail address or phone number, left in text that is sent.
 */

/** What stands in for a long hash, a key-like run or a run of seed words in text sent to Claude. */
export const MASK = "[hidden]";

const HEX_64 = /(?<![0-9a-z])(?:0x)?[0-9a-f]{64}(?![0-9a-z])/iu;
const BASE58 = "1-9A-HJ-NP-Za-km-z";
const BASE58_KEY = new RegExp(`(?<![${BASE58}])[${BASE58}]{87,88}(?![${BASE58}])`, "gu");
const BYTE_ARRAY = /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/gu;
/** For masking: hex of 64 or more (transaction hashes, keys), base58 of 87 or more (signatures, keypairs), arrays of 32 or more small numbers. */
const HEX_LONG = /(?<![0-9a-z])(?:0x)?[0-9a-f]{64,}(?![0-9a-z])/giu;
const BASE58_LONG = new RegExp(`(?<![${BASE58}])[${BASE58}]{87,}(?![${BASE58}])`, "gu");
const NUMBER_ARRAY = /\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/gu;
/** Ed25519 seeds wrapped as PKCS#8 (RFC 8410), which node:crypto reads. */
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
/** At most this many key-like runs are checked per message. */
const MAX_CHECKS = 8;

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin's alphabet) to bytes, or null for a character outside it. */
function base58(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of text) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/** 64 bytes whose last 32 are the Ed25519 public key of the first 32: a Solana keypair (its secret key). */
function isKeypair(bytes: Uint8Array): boolean {
  if (bytes.length !== 64) return false;
  try {
    const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(bytes.subarray(0, 32))]), format: "der", type: "pkcs8" });
    const jwk = createPublicKey(key).export({ format: "jwk" });
    return typeof jwk.x === "string" && Buffer.from(jwk.x, "base64url").equals(Buffer.from(bytes.subarray(32)));
  } catch {
    return false;
  }
}

/** A 64-hex key beside key words, or a Solana keypair in base58 or as a 64-number array. */
function privateKey(text: string): boolean {
  if (HEX_64.test(text) && matchesAny(KEY_WORDS, text.toLowerCase())) return true;
  let checks = 0;
  for (const m of text.matchAll(BASE58_KEY)) {
    if (++checks > MAX_CHECKS) return false;
    const bytes = base58(m[0]);
    if (bytes && isKeypair(bytes)) return true;
  }
  for (const m of text.matchAll(BYTE_ARRAY)) {
    if (++checks > MAX_CHECKS) return false;
    const numbers = m[0].slice(1, -1).split(",").map((n) => Number(n.trim()));
    if (numbers.every((n) => n <= 255) && isKeypair(Uint8Array.from(numbers))) return true;
  }
  return false;
}

/**
 * seed_phrase: 12, 15, 18, 21 or 24 words in a row from one BIP-39
 * wordlist (ten languages; words split on spaces only, numbering such as
 * "1." "1)" "#1" ignored) with a valid checksum. private_key: a 64-hex run
 * (with or without 0x) in a message with key words, or a Solana keypair.
 * seed_probable: such a run with a bad checksum, or one word off. Anything
 * else, transaction hashes and signatures included, is no secret.
 */
export function findSecret(text: string): "seed_phrase" | "seed_probable" | "private_key" | null {
  const seed = findSeed(text);
  if (seed === "valid") return "seed_phrase";
  if (privateKey(text.normalize("NFKC"))) return "private_key";
  return seed === "probable" ? "seed_probable" : null;
}

/**
 * Text as it may go to Claude, whoever wrote it: every hex run of 64 or more
 * (optional 0x), base58 run of 87 or more, array of 32 or more small
 * numbers, e-mail address, phone number (secrets-contacts.ts; with
 * `entities`, Telegram's marks on `text` as given too) and run of six or
 * more words from one BIP-39 wordlist becomes MASK. Token addresses stay, so
 * a question can still name one.
 */
export function maskForModel(text: string, entities: readonly TgMessageEntity[] = []): string {
  const marked = maskMarked(typeof text === "string" ? text : "", entities, MASK);
  const masked = maskContacts(marked.normalize("NFKC").replace(HEX_LONG, MASK).replace(BASE58_LONG, MASK).replace(NUMBER_ARRAY, MASK), MASK);
  const words = tokens(masked);
  // Runs from two wordlists can overlap (English and French share words): merge them, then replace from the end.
  const spans: Array<[number, number]> = [];
  for (const run of seedRuns(words, MASK_RUN).sort((a, b) => a.from - b.from)) {
    const [start, end] = [words[run.from].start, words[run.to - 1].end];
    const last = spans[spans.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  let out = masked;
  for (const [start, end] of spans.reverse()) out = `${out.slice(0, start)}${MASK}${out.slice(end)}`;
  return out;
}
