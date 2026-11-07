/**
 * Just enough Solana key handling for the holder checks: base58, and whether a
 * key is a point on the ed25519 curve. Wallets are (they sign with the matching
 * private key); program-derived addresses, which own bonding curves, pools and
 * lock escrows, are built to be off the curve.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// BigInt() rather than literals: the project compiles to ES2017.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const EIGHT = BigInt(8);
const FIFTY_EIGHT = BigInt(58);
const P = BigInt(2) ** BigInt(255) - BigInt(19);

const mod = (a: bigint) => {
  const r = a % P;
  return r >= ZERO ? r : r + P;
};

function power(base: bigint, exponent: bigint): bigint {
  let result = ONE;
  let b = mod(base);
  let e = exponent;
  while (e > ZERO) {
    if (e & ONE) result = (result * b) % P;
    b = (b * b) % P;
    e >>= ONE;
  }
  return result;
}

/** The curve constant d = −121665 / 121666. */
const D = mod(BigInt(-121665) * power(BigInt(121666), P - BigInt(2)));

export function base58Decode(text: string): Uint8Array | null {
  let n = ZERO;
  for (const ch of text) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    n = n * FIFTY_EIGHT + BigInt(digit);
  }
  const bytes: number[] = [];
  for (; n > ZERO; n >>= EIGHT) bytes.push(Number(n & BigInt(0xff)));
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export function base58Encode(bytes: Uint8Array): string {
  let n = ZERO;
  for (const b of bytes) n = (n << EIGHT) | BigInt(b);
  let out = "";
  for (; n > ZERO; n /= FIFTY_EIGHT) out = ALPHABET[Number(n % FIFTY_EIGHT)] + out;
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/**
 * Whether 32 bytes decompress to a curve point, as Solana's is_on_curve
 * checks it: y is the low 255 bits, and x² = (y² − 1) / (d·y² + 1) must have
 * a square root.
 */
export function isOnCurve(key: Uint8Array): boolean {
  if (key.length !== 32) return false;
  let y = ZERO;
  for (let i = 31; i >= 0; i--) y = (y << EIGHT) | BigInt(i === 31 ? key[i] & 0x7f : key[i]);
  y = mod(y);
  const y2 = (y * y) % P;
  const u = mod(y2 - ONE);
  const v = mod(D * y2 + ONE);
  const v3 = (((v * v) % P) * v) % P;
  const v7 = (((v3 * v3) % P) * v) % P;
  const x = (((u * v3) % P) * power((u * v7) % P, (P - BigInt(5)) / EIGHT)) % P;
  const check = (((v * x) % P) * x) % P;
  return check === u || check === mod(-u);
}

/** True for an address a person can sign with; false for program-derived addresses and junk. */
export function isWalletAddress(address: string): boolean {
  const key = base58Decode(address);
  return key !== null && key.length === 32 && isOnCurve(key);
}
