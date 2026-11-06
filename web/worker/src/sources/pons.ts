import type { PonsRpc } from "./robinhood";

/**
 * Pons (V2) on Robinhood Chain, read straight from the chain's logs. Each
 * launch gets its own bonding-curve contract; it trades there until it raises
 * its graduation amount, then moves to a Uniswap v4 pool (DexScreener covers
 * that part). DexScreener doesn't list the curves, so the worker follows them.
 *
 * topic0 is keccak256 of each signature (checked in worker/tests/pons.test.ts):
 *   factory TokenLaunched(address indexed token, address indexed curve, address indexed deployer,
 *                         address pairToken, uint256 launchConfigId, uint256 graduationThreshold)
 *   factory PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)
 *   curve   CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)
 *   curve   CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)
 *   curve   CurveCompleted(address recipient, uint256 quoteOut, uint256 tokenOut)
 */
export const PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000";
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

export const PONS_TOPICS = {
  launched: "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607",
  graduated: "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259",
  buy: "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455",
  sell: "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df",
  completed: "0xf8d37a90738ae063b8b8058b66f5880cf3cf7ab0c5d4fa78219696591dfbfb67",
} as const;

/** ERC-20 reads: name(), symbol(), decimals(), and Pons's logo() (an ipfs:// link). */
export const SELECTORS = { name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567", logo: "0xfb7f21eb" } as const;

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  /** Some RPCs fill this in; Robinhood Chain's public one sends 0x0. */
  blockTimestamp?: string;
  transactionHash: string;
}

export interface PonsLaunch {
  kind: "launch";
  token: string;
  curve: string;
  creator: string;
  /** The quote asset (the zero address is native ETH). */
  quote: string;
  configId: bigint;
  /** Graduation amount, in the quote asset's base units. */
  threshold: bigint;
  at: number;
  tx: string;
}

export interface PonsTrade {
  kind: "trade";
  curve: string;
  side: "buy" | "sell";
  /** Quote paid in (buys) or paid out (sells), in base units. */
  quoteAmount: bigint;
  /** Tokens out (buys) or in (sells), 18 decimals. */
  tokenAmount: bigint;
  fee: bigint;
  tax: bigint;
  at: number;
  tx: string;
}

export interface PonsGraduation {
  kind: "graduation";
  token: string | null;
  curve: string | null;
  at: number;
}

export type PonsEvent = PonsLaunch | PonsTrade | PonsGraduation;

const word = (data: string, i: number) => BigInt("0x" + (data.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"));
const wordCount = (data: string) => Math.floor((data.length - 2) / 64);
const topicAddress = (topic: string | undefined) => "0x" + (topic ?? "").slice(-40).toLowerCase();
const wordAddress = (data: string, i: number) => "0x" + data.slice(2 + i * 64 + 24, 2 + (i + 1) * 64).toLowerCase();

/**
 * One log as a Pons event, or null. Launches and pool graduations must come
 * from the factory; the book only accepts trades from curves the factory made.
 * `timeOf` gives a block's time in ms when the log doesn't carry it.
 */
export function parsePonsLog(log: RpcLog, timeOf: (block: number) => number): PonsEvent | null {
  const stamped = log.blockTimestamp ? Number(BigInt(log.blockTimestamp)) : 0;
  const at = stamped > 0 ? stamped * 1000 : timeOf(Number(BigInt(log.blockNumber)));
  const source = log.address.toLowerCase();
  const [topic0] = log.topics;
  if (topic0 === PONS_TOPICS.launched) {
    if (source !== PONS_FACTORY || log.topics.length < 4 || wordCount(log.data) < 3) return null;
    return {
      kind: "launch",
      token: topicAddress(log.topics[1]),
      curve: topicAddress(log.topics[2]),
      creator: topicAddress(log.topics[3]),
      quote: wordAddress(log.data, 0),
      configId: word(log.data, 1),
      threshold: word(log.data, 2),
      at,
      tx: log.transactionHash,
    };
  }
  if (topic0 === PONS_TOPICS.graduated) {
    if (source !== PONS_FACTORY || log.topics.length < 2) return null;
    return { kind: "graduation", token: topicAddress(log.topics[1]), curve: null, at };
  }
  if (topic0 === PONS_TOPICS.completed) return { kind: "graduation", token: null, curve: source, at };
  if (topic0 === PONS_TOPICS.buy || topic0 === PONS_TOPICS.sell) {
    if (log.topics.length < 3 || wordCount(log.data) < 4) return null;
    const buy = topic0 === PONS_TOPICS.buy;
    return {
      kind: "trade",
      curve: source,
      side: buy ? "buy" : "sell",
      quoteAmount: word(log.data, buy ? 0 : 1),
      tokenAmount: word(log.data, buy ? 1 : 0),
      fee: word(log.data, 2),
      tax: word(log.data, 3),
      at,
      tx: log.transactionHash,
    };
  }
  return null;
}

/** A Solidity `string` return value, or null. */
export function decodeAbiString(result: string | null): string | null {
  if (!result || result.length < 2 + 128) return null;
  const offset = Number(BigInt("0x" + result.slice(2, 66)));
  const start = 2 + offset * 2;
  const length = Number(BigInt("0x" + (result.slice(start, start + 64) || "0")));
  if (length > 4_096) return null;
  const text = Buffer.from(result.slice(start + 64, start + 64 + length * 2), "hex").toString("utf8");
  return text.replace(/\0/g, "").trim() || null;
}

export async function readDecimals(rpc: PonsRpc, token: string): Promise<number | null> {
  const result = await rpc.call(token, SELECTORS.decimals);
  if (!result || result === "0x") return null;
  const decimals = Number(BigInt(result));
  return decimals <= 36 ? decimals : null;
}

/** A Pons token's name, symbol and logo link, straight from its contract. */
export async function readTokenMeta(rpc: PonsRpc, token: string): Promise<{ name: string | null; symbol: string | null; logo: string | null }> {
  const [name, symbol, logo] = await Promise.all([
    rpc.call(token, SELECTORS.name),
    rpc.call(token, SELECTORS.symbol),
    rpc.call(token, SELECTORS.logo),
  ]);
  return { name: decodeAbiString(name), symbol: decodeAbiString(symbol), logo: decodeAbiString(logo) };
}
