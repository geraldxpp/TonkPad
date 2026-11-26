// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english";
import { wordlist as japanese } from "@scure/bip39/wordlists/japanese";
import { wordlist as spanish } from "@scure/bip39/wordlists/spanish";
import { describe, expect, it } from "vitest";
import { FROZEN_SOURCES } from "@/modules/security/lib/frozen-build";
import { findSecret, MASK, maskForModel } from "../src/telegram/mod/secrets";

const bytes = (n: number, fill: (i: number) => number) => Uint8Array.from({ length: n }, (_, i) => fill(i) & 0xff);
/** BIP-39's own test vector: 16 bytes of 0x7f. */
const EN_12 = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const EN_24 = entropyToMnemonic(bytes(32, (i) => i * 37 + 11), english);
const ES_12 = entropyToMnemonic(bytes(16, (i) => i * 13 + 5), spanish);
const JA_12 = entropyToMnemonic(bytes(16, (i) => i * 29 + 3), japanese);
const TX_HASH = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(data: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of data) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 256;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = "";
  for (const byte of data) {
    if (byte !== 0) break;
    zeros += "1";
  }
  return zeros + digits.reverse().map((d) => ALPHABET[d]).join("");
}

/** A real Solana keypair's 64-byte secret key: the Ed25519 seed, then its public key. */
function solanaKeypair(): Uint8Array {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d ?? "", "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x ?? "", "base64url");
  return Uint8Array.from([...seed, ...pub]);
}

describe("recovery phrases", () => {
  it("the fixtures are valid phrases, the Japanese one joined by ideographic spaces", () => {
    for (const [phrase, list] of [[EN_12, english], [EN_24, english], [ES_12, spanish], [JA_12, japanese]] as const) expect(validateMnemonic(phrase, list)).toBe(true);
    expect(JA_12).toContain("　");
  });

  it.each([
    ["12 English words", EN_12],
    ["24 English words", EN_24],
    ["12 Spanish words", ES_12],
    ["12 Japanese words with ideographic spaces", JA_12],
    ["a phrase inside a message", `help, my wallet is empty. my phrase: ${EN_12}. what now?`],
    ["a numbered list", EN_12.split(" ").map((w, i) => `${i + 1}. ${w}`).join(" ")],
    ["a numbered column", EN_12.split(" ").map((w, i) => `${i + 1}) ${w}`).join("\n")],
    ["hash-numbered words", EN_12.split(" ").map((w, i) => `#${i + 1} ${w}`).join(" ")],
    ["numbers glued to words", EN_12.split(" ").map((w, i) => `${i + 1}.${w},`).join(" ")],
    ["capitals", EN_12.toUpperCase()],
  ])("%s", (_, text) => {
    expect(findSecret(text)).toBe("seed_phrase");
  });

  it("calls a bad checksum or one typo probable", () => {
    const badChecksum = EN_12.replace(/yellow$/, "abandon");
    expect(validateMnemonic(badChecksum, english)).toBe(false);
    expect(findSecret(badChecksum)).toBe("seed_probable");
    expect(findSecret(EN_12.replace(/yellow$/, "yelow"))).toBe("seed_probable");
    expect(findSecret(EN_12.replace(/^legal/, "legl"))).toBe("seed_probable");
  });

  it.each([
    ["Chinese prose without spaces", "我觉得这个项目很好，团队也很努力，什么时候上线新功能？我想知道手续费是多少。"],
    ["an ordinary sentence", "please help me, I lost access to my wallet after the update and the support page did not load"],
    ["a list of common words", "buy sell hold wait pump dump moon rocket rug pull scam fake real legit"],
    ["a 0x transaction hash", `check my tx ${TX_HASH}`],
    ["an EVM address", "the launchpad is 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95"],
    ["a Solana address", "mint 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"],
    ["a Spanish sentence", "hola a todos, alguien sabe cuándo se gradúa el token y cuánto cuesta lanzar"],
    ["a Russian sentence", "подскажите, пожалуйста, когда токен перейдет на юнисвоп и какая комиссия"],
  ])("%s is no secret", (_, text) => {
    expect(findSecret(text)).toBeNull();
  });

  it("leaves the Security page's frozen-build hashes alone", () => {
    for (const source of FROZEN_SOURCES) expect(findSecret(`${source.file}: ${source.sha256}`)).toBeNull();
  });

  it("leaves a Solana transaction signature alone (64 bytes that aren't a keypair)", () => {
    const signature = base58(bytes(64, (i) => i * 7 + 1));
    expect(signature.length).toBeGreaterThanOrEqual(87);
    expect(findSecret(`sig: ${signature}`)).toBeNull();
  });
});

describe("private keys", () => {
  const HEX_KEY = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";

  it.each([
    ["English", `my private key is 0x${HEX_KEY}`],
    ["English, without 0x", `here is my privkey ${HEX_KEY} pls help`],
    ["Spanish", `mi clave privada es ${HEX_KEY}`],
    ["Russian", `мой приватный ключ: ${HEX_KEY}`],
    ["Chinese", `我的私钥是${HEX_KEY}`],
  ])("a hex key beside key words (%s)", (_, text) => {
    expect(findSecret(text)).toBe("private_key");
  });

  it("a hex run without key words is a hash, not a key", () => {
    expect(findSecret(`tx ${HEX_KEY}`)).toBeNull();
  });

  it("a real Solana keypair, in base58 and as a byte array", () => {
    const keypair = solanaKeypair();
    expect(findSecret(`import this: ${base58(keypair)}`)).toBe("private_key");
    expect(findSecret(`[${[...keypair].join(",")}]`)).toBe("private_key");
    expect(findSecret(`[${[...keypair].join(", ")}]`)).toBe("private_key");
  });

  it("an array of 64 numbers that isn't a keypair is nothing", () => {
    expect(findSecret(`[${[...bytes(64, (i) => i)].join(",")}]`)).toBeNull();
  });
});

describe("maskForModel", () => {
  it("hides a transaction hash and keeps the rest", () => {
    expect(maskForModel(`check my tx ${TX_HASH} please`)).toBe(`check my tx ${MASK} please`);
  });

  it("hides signatures, byte arrays and runs of seed words, and keeps addresses", () => {
    const signature = base58(bytes(64, (i) => i * 5 + 2));
    const masked = maskForModel(`sig ${signature} arr [${[...bytes(32, (i) => i)].join(",")}] words ${EN_12.split(" ").slice(0, 8).join(" ")} xyzzy`);
    expect(masked).toBe(`sig ${MASK} arr ${MASK} words ${MASK} xyzzy`);
    const address = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
    expect(maskForModel(`is ${address} legit?`)).toBe(`is ${address} legit?`);
  });

  it("keeps ordinary sentences whole", () => {
    const text = "great project, love the community. when does the token graduate?";
    expect(maskForModel(text)).toBe(text);
  });
});
