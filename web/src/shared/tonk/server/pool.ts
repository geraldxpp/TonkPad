import { encodeAbiParameters, encodeFunctionData, parseAbi, type PublicClient } from "viem";
import type { TradeSide } from "../mission";
import type { TonkNetwork, UniswapContracts } from "../networks";
import type { PoolQuoteJson, PoolTradeBuild, PoolTradeRequest } from "../pool";
import { LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { isTxHash } from "../types";
import { type Address, address, approvalReceipt, headAtLeast, invalid, isRecord, padGas, refusal, requireFunds, unsigned, wei, ZERO_ADDRESS } from "./build";
import { TonkError, tonkClient } from "./client";
import { checkedKey, MIGRATOR_ABI, POOL_KEY, type PoolKey, poolIdOf } from "./pool-key";

export { GUARD_ABI, MIGRATOR_ABI, poolIdAt, poolIdOf, type PoolKey } from "./pool-key";

export const QUOTER_ABI = parseAbi([
  POOL_KEY,
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
export const ROUTER_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
export const PERMIT2_ABI = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
/** v4-core's Swap: `amount0` and `amount1` are the swapper's own deltas (negative: paid in), as PoolManager accounts them. */
export const POOL_MANAGER_ABI = parseAbi(["event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"]);

/** The router's V4_SWAP command. */
const V4_SWAP = "0x10";
/** SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL: v4-periphery 1.0.3's actions, as the deployed router takes them (proven on the mainnet fork). */
const ACTIONS = "0x060c0f";
/** A swap must land within ten minutes of the block it was checked at. */
const DEADLINE_SECONDS = 600;
/** The router's Permit2 allowance lasts thirty minutes: long enough to sign, never a standing approval. */
const ALLOWANCE_SECONDS = 1_800;
const ZERO = BigInt(0);

const SINGLE_TYPES = [
  {
    type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: [{ name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;
const PAY = [{ type: "address" }, { type: "uint256" }] as const;

/** One V4_SWAP input: swap exactly `amountIn`, pay it in full, take at least `minOut`. ETH is currency0, so a buy is zeroForOne. */
export function swapInput(key: PoolKey, buy: boolean, amountIn: bigint, minOut: bigint): `0x${string}` {
  const params = [
    encodeAbiParameters(SINGLE_TYPES, [{ poolKey: key, zeroForOne: buy, amountIn, amountOutMinimum: minOut, hookData: "0x" }]),
    encodeAbiParameters(PAY, [buy ? key.currency0 : key.currency1, amountIn]),
    encodeAbiParameters(PAY, [buy ? key.currency1 : key.currency0, minOut]),
  ];
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [ACTIONS, params]);
}

export function requireUniswap(network: TonkNetwork): UniswapContracts {
  if (!network.uniswap) throw new TonkError("closed", "graduated pools don't trade on this network yet", 404);
  return network.uniswap;
}

export function parsePoolTradeRequest(body: unknown): PoolTradeRequest {
  if (!isRecord(body)) throw invalid("not an object");
  if (body.side !== "buy" && body.side !== "sell") throw invalid("side");
  const approval = body.approval === null || body.approval === undefined ? null : typeof body.approval === "string" && isTxHash(body.approval) ? body.approval : null;
  if (body.approval !== null && body.approval !== undefined && approval === null) throw invalid("approval");
  return { token: address(body.token, "token"), trader: address(body.trader, "trader"), side: body.side, amount: String(wei(body.amount, "amount")), minOut: String(wei(body.minOut, "minimum")), approval };
}

/**
 * The block of the approval or allowance this trader's wallet just confirmed
 * for a sale (to the token or to Permit2): the build reads no earlier. A
 * receipt the RPC doesn't have yet, or can't read, is read again; one that is
 * there but isn't this sale's approval is refused at once.
 */
async function approvalBlock(client: PublicClient, uniswap: UniswapContracts, request: PoolTradeRequest, hash: `0x${string}`): Promise<bigint> {
  const receipt = await approvalReceipt(client, hash);
  const to = receipt.to?.toLowerCase();
  if (receipt.status !== "success" || receipt.from.toLowerCase() !== request.trader.toLowerCase() || (to !== request.token.toLowerCase() && to !== uniswap.permit2)) {
    throw new TonkError("unavailable", "not this sale's approval");
  }
  return receipt.blockNumber;
}

interface PoolAt {
  key: PoolKey;
  id: `0x${string}`;
  feeBps: number;
}

/** A graduated token's pool at one block. Still on its curve, or graduated with its pool not yet open, it says so. */
export async function readPoolAt(client: PublicClient, network: TonkNetwork, token: Address, blockNumber: bigint): Promise<PoolAt> {
  const read = <T>(promise: Promise<T>) =>
    promise.catch(() => {
      throw new TonkError("unavailable", "pool unreadable");
    });
  const position = await read(client.readContract({ address: network.migrator, abi: MIGRATOR_ABI, functionName: "lockedPositions", args: [token], blockNumber }));
  if (!position[8]) {
    const mission = await read(client.readContract({ address: network.launchpad, abi: LAUNCHPAD_ABI, functionName: "missions", args: [token], blockNumber }));
    if (mission[0].toLowerCase() === ZERO_ADDRESS) throw new TonkError("missing", "not a mission of this launchpad", 404);
    throw mission[6] ? new TonkError("pending", "the pool opens once graduation completes", 409) : new TonkError("curve", "still on its curve", 409);
  }
  const fee = position[5];
  // The migrator's guarded pool at the fee it recorded: never a look-alike someone else created for the same token.
  const key = await checkedKey(client, network, requireUniswap(network), token, fee, blockNumber);
  return { key, id: poolIdOf(key), feeBps: fee / 100 };
}

async function quoteAt(client: PublicClient, uniswap: UniswapContracts, key: PoolKey, buy: boolean, amountIn: bigint, blockNumber: bigint): Promise<bigint> {
  try {
    const { result } = await client.simulateContract({ address: uniswap.quoter, abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: key, zeroForOne: buy, exactAmount: amountIn, hookData: "0x" }], blockNumber });
    return result[0];
  } catch (error) {
    throw refusal(error);
  }
}

async function blockOf(client: PublicClient): Promise<bigint> {
  return client.getBlockNumber().catch(() => {
    throw new TonkError("unavailable", "block unreadable");
  });
}

/** What the pool gives now for an exact amount in. Nothing is built. */
export async function quotePool(network: TonkNetwork, token: Address, side: TradeSide, amountIn: bigint): Promise<PoolQuoteJson> {
  const uniswap = requireUniswap(network);
  const client = await tonkClient(network);
  const blockNumber = await blockOf(client);
  const pool = await readPoolAt(client, network, token, blockNumber);
  const out = await quoteAt(client, uniswap, pool.key, side === "buy", amountIn, blockNumber);
  return { pool: pool.id, side, amountIn: String(amountIn), out: String(out), feeBps: pool.feeBps, block: Number(blockNumber) };
}

/** A transaction with its gas estimated and the trader's balance checked for it. */
async function checked(client: PublicClient, trader: Address, to: Address, data: `0x${string}`, value: bigint) {
  let gas: bigint;
  try {
    gas = padGas(await client.estimateGas({ account: trader, to, data, value }));
  } catch (error) {
    throw refusal(error);
  }
  await requireFunds(client, trader, value, gas);
  return unsigned(to, data, value, gas);
}

/**
 * Builds a pool trade for the trader's wallet. The pool and V4Quoter's
 * quote are read at one block, and the exact swap is run there with the
 * quote itself as its minimum: the router's answer must reach the quote, or
 * nothing is built. A quote under the trader's minimum comes back as
 * "moved". A sell first gets an approval of Permit2 for exactly the amount,
 * then a thirty-minute router allowance for exactly the amount. Nothing is
 * sent here; only the trader's wallet can.
 */
export async function buildPoolTrade(network: TonkNetwork, request: PoolTradeRequest): Promise<PoolTradeBuild> {
  const uniswap = requireUniswap(network);
  const client = await tonkClient(network);
  // After an approval, never read the chain from before it (an RPC replica can lag a moment).
  const floor = request.approval ? await approvalBlock(client, uniswap, request, request.approval as `0x${string}`) : null;
  const blockNumber = await headAtLeast(client, floor);
  const token = request.token as Address;
  const trader = request.trader as Address;
  const buy = request.side === "buy";
  const amount = BigInt(request.amount);
  const minOut = BigInt(request.minOut);
  const pool = await readPoolAt(client, network, token, blockNumber);
  const out = await quoteAt(client, uniswap, pool.key, buy, amount, blockNumber);
  const quote: PoolQuoteJson = { pool: pool.id, side: request.side, amountIn: request.amount, out: String(out), feeBps: pool.feeBps, block: Number(blockNumber) };
  if (out < minOut) return { step: "moved", quote };
  const { timestamp } = await client.getBlock({ blockNumber });

  if (!buy) {
    const [held, approved, [allowed, expiration]] = await Promise.all([
      client.readContract({ address: token, abi: TOKEN_ABI, functionName: "balanceOf", args: [trader], blockNumber }),
      client.readContract({ address: token, abi: TOKEN_ABI, functionName: "allowance", args: [trader, uniswap.permit2], blockNumber }),
      client.readContract({ address: uniswap.permit2, abi: PERMIT2_ABI, functionName: "allowance", args: [trader, token, uniswap.universalRouter], blockNumber }),
    ]).catch(() => {
      throw new TonkError("unavailable", "allowances unreadable");
    });
    if (held < amount) throw new TonkError("tokens", "not enough tokens", 409);
    if (approved < amount) {
      const data = encodeFunctionData({ abi: TOKEN_ABI, functionName: "approve", args: [uniswap.permit2, amount] });
      return { step: "approve", tx: await checked(client, trader, token, data, ZERO), quote };
    }
    if (allowed < amount || BigInt(expiration) < timestamp + BigInt(DEADLINE_SECONDS)) {
      const data = encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [token, uniswap.universalRouter, amount, Number(timestamp) + ALLOWANCE_SECONDS] });
      return { step: "allow", tx: await checked(client, trader, uniswap.permit2, data, ZERO), quote };
    }
  }

  const deadline = timestamp + BigInt(DEADLINE_SECONDS);
  const value = buy ? amount : ZERO;
  const execute = (minimum: bigint) => encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: [V4_SWAP, [swapInput(pool.key, buy, amount, minimum)], deadline] });
  try {
    // The proof: at the quote's own block, the swap delivers at least the quote.
    await client.call({ account: trader, to: uniswap.universalRouter, data: execute(out), value, blockNumber });
  } catch (error) {
    throw refusal(error);
  }
  return { step: "trade", tx: await checked(client, trader, uniswap.universalRouter, execute(minOut), value), quote };
}
