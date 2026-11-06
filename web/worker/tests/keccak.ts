/**
 * Keccak-256 (Ethereum's hash), for tests only: it checks the event topics and
 * function selectors the worker hard-codes. Slow (BigInt lanes) but tiny.
 */
const RC = [
  "0000000000000001", "0000000000008082", "800000000000808a", "8000000080008000", "000000000000808b", "0000000080000001",
  "8000000080008081", "8000000000008009", "000000000000008a", "0000000000000088", "0000000080008009", "000000008000000a",
  "000000008000808b", "800000000000008b", "8000000000008089", "8000000000008003", "8000000000008002", "8000000000000080",
  "000000000000800a", "800000008000000a", "8000000080008081", "8000000000008080", "0000000080000001", "8000000080008008",
].map((h) => BigInt("0x" + h));
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const MASK = (BigInt(1) << BigInt(64)) - BigInt(1);
const ZERO = BigInt(0);

const rotl = (v: bigint, n: number) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK);

function permute(s: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
    }
    const b: bigint[] = new Array(25).fill(ZERO);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) s[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & MASK & b[((x + 2) % 5) + 5 * y]);
    }
    s[0] ^= RC[round];
  }
}

/** keccak256 of a UTF-8 string, as 0x-prefixed hex. */
export function keccak256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s: bigint[] = new Array(25).fill(ZERO);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = ZERO;
      for (let k = 0; k < 8; k++) lane |= BigInt(padded[off + i * 8 + k]) << BigInt(8 * k);
      s[i] ^= lane;
    }
    permute(s);
  }
  let out = "0x";
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 8; k++) out += Number((s[i] >> BigInt(8 * k)) & BigInt(0xff)).toString(16).padStart(2, "0");
  }
  return out;
}
