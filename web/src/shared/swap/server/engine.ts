import type { ChainId } from "@/shared/types/chain";
import type { SwapBuild, SwapQuote } from "@/shared/types/swap";
import { jsonRpc } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import { toUnits } from "@/shared/wallet/units";
import { NATIVE_EVM, USDC_MINT, USDG, WETH } from "../tokens";
import { cached } from "./cache";
import { type SwapConfig, SwapError } from "./config";
import { jupiterBuild, jupiterPrices } from "./jupiter";
import { assembleSolanaTransaction, associatedAccount, feeSide, networkFee, RENT_EXEMPT_MIN, type SolanaFee } from "./solana-tx";
import { tokenInfo } from "./token-info";
import { ethUsd, evmFeeToken, zeroEx } from "./zeroex";

export interface SwapRequest {
  chain: ChainId;
  from: string;
  to: string;
  /** Raw input amount. */
  amount: string;
  slippageBps: number;
  /** The wallet that will sign, when one is connected. */
  taker: string | null;
}

const BPS = BigInt(10_000);
const share = (amount: bigint, bps: number) => (amount * BigInt(bps)) / BPS;

/** Whether the fee wallet can take this fee now: SOL needs the wallet funded past rent (or a big enough fee); USDC its USDC account. */
async function feeReady(mint: string, amount: bigint, wallet: string): Promise<boolean> {
  if (amount <= BigInt(0)) return false;
  const rpc = jsonRpc(walletRpcUrl("sol"));
  if (mint === USDC_MINT) {
    return cached(`fee-usdc:${wallet}`, 5 * 60_000, async () => {
      const info = await rpc("getAccountInfo", [associatedAccount(wallet, USDC_MINT).toBase58(), { encoding: "base64" }]);
      return typeof info === "object" && info !== null && "value" in info && info.value !== null;
    }).catch(() => false);
  }
  if (amount >= RENT_EXEMPT_MIN) return true;
  return cached(`fee-sol:${wallet}`, 60_000, async () => {
    const balance = await rpc("getBalance", [wallet]);
    const lamports = typeof balance === "object" && balance !== null && "value" in balance ? Number(balance.value) : 0;
    return BigInt(Math.trunc(lamports)) >= RENT_EXEMPT_MIN;
  }).catch(() => false);
}

/** USD of both sides: Jupiter prices on Solana; on Robinhood Chain the ETH or dollar side, carried across the trade. */
async function usdValues(request: SwapRequest, out: string, config: SwapConfig): Promise<[number | null, number | null]> {
  const [fromToken, toToken] = await Promise.all([tokenInfo(request.chain, request.from), tokenInfo(request.chain, request.to)]);
  if (!fromToken || !toToken) return [null, null];
  const inUnits = toUnits({ raw: request.amount, decimals: fromToken.decimals });
  const outUnits = toUnits({ raw: out, decimals: toToken.decimals });
  if (request.chain === "sol") {
    const prices = await cached(`px:${request.from}:${request.to}`, 30_000, () => jupiterPrices([request.from, request.to], config.jupiterKey)).catch(() => ({} as Record<string, number>));
    const inUsd = prices[request.from] !== undefined ? inUnits * prices[request.from] : null;
    const outUsd = prices[request.to] !== undefined ? outUnits * prices[request.to] : null;
    return [inUsd, outUsd ?? inUsd];
  }
  const eth = await cached("px:eth", 60_000, () => ethUsd(config.zeroExKey)).catch(() => null);
  const unitUsd = (address: string) => {
    const lower = address.toLowerCase();
    if (lower === USDG.toLowerCase()) return 1;
    if (lower === NATIVE_EVM.toLowerCase() || lower === WETH.toLowerCase()) return eth;
    return null;
  };
  const fromUsd = unitUsd(request.from);
  const toUsd = unitUsd(request.to);
  const inUsd = fromUsd !== null ? inUnits * fromUsd : toUsd !== null ? outUnits * toUsd : null;
  const outUsd = toUsd !== null ? outUnits * toUsd : inUsd;
  return [inUsd, outUsd];
}

interface Planned {
  quote: SwapQuote;
  build?: SwapBuild;
}

/** Route sizes to try: most routes fit at 40 accounts with the fee; long ones get rebuilt simpler. */
const MAX_ACCOUNTS = [40, 24] as const;

async function solana(request: SwapRequest, config: SwapConfig, withTx: boolean, maxAccounts: number = MAX_ACCOUNTS[0]): Promise<Planned> {
  // Jupiter's keyless tier (0.5 requests a second) can't serve a site; without a key there are no Solana quotes.
  if (!config.jupiterKey) throw new SwapError("unavailable", "jupiter: no API key");
  const taker = request.taker ?? config.solanaFeeWallet ?? config.quoteTakerSol;
  const side = config.solanaFeeWallet ? feeSide(request.from, request.to) : null;
  const total = BigInt(request.amount);
  let fee: SolanaFee | null = null;
  if (side?.side === "in" && config.solanaFeeWallet) {
    const amount = share(total, config.feeBps);
    if (await feeReady(side.mint, amount, config.solanaFeeWallet)) fee = { ...side, amount, wallet: config.solanaFeeWallet };
  }
  const routed = fee ? total - fee.amount : total;
  const route = { inputMint: request.from, outputMint: request.to, amount: routed.toString(), slippageBps: request.slippageBps, taker };
  // A venue can fail for a moment ("oracle price out of date"); one retry with a smaller route usually finds another.
  const build = await jupiterBuild({ ...route, maxAccounts }, config.jupiterKey).catch((error: unknown) => {
    if (error instanceof SwapError && error.code === "unavailable" && maxAccounts === MAX_ACCOUNTS[0]) {
      return jupiterBuild({ ...route, maxAccounts: MAX_ACCOUNTS[1] }, config.jupiterKey);
    }
    throw error;
  });
  if (side?.side === "out" && config.solanaFeeWallet) {
    const amount = share(BigInt(build.otherAmountThreshold), config.feeBps);
    if (await feeReady(side.mint, amount, config.solanaFeeWallet)) fee = { ...side, amount, wallet: config.solanaFeeWallet };
  }
  const outFee = fee?.side === "out" ? fee.amount : BigInt(0);
  const outAmount = (BigInt(build.outAmount) - outFee).toString();
  const [inUsd, outUsd] = await usdValues(request, outAmount, config);
  const quote: SwapQuote = {
    chain: "sol",
    provider: "jupiter",
    inToken: request.from,
    outToken: request.to,
    inAmount: request.amount,
    outAmount,
    minOut: (BigInt(build.otherAmountThreshold) - outFee).toString(),
    slippageBps: build.slippageBps,
    priceImpact: build.priceImpactPct,
    fee: fee ? { bps: config.feeBps, amount: fee.amount.toString(), token: fee.mint } : null,
    networkFee: networkFee(build).toString(),
    inUsd,
    outUsd,
    route: build.labels,
    tradingOpen: config.tradingOpen,
    quotedAt: Date.now(),
  };
  if (!withTx) return { quote };
  try {
    const transaction = assembleSolanaTransaction(build, taker, fee);
    return { quote, build: { quote, solana: { transaction, lastValidBlockHeight: build.lastValidBlockHeight } } };
  } catch (error) {
    // Too big with the fee: build again over a simpler route.
    if (maxAccounts !== MAX_ACCOUNTS[0]) throw error;
    return solana(request, config, true, MAX_ACCOUNTS[1]);
  }
}

async function robinhood(request: SwapRequest, config: SwapConfig, withTx: boolean): Promise<Planned> {
  const fee = config.evmFeeWallet ? { recipient: config.evmFeeWallet, bps: config.feeBps, token: evmFeeToken(request.from, request.to) } : null;
  const result = await zeroEx(
    withTx ? "quote" : "price",
    { sellToken: request.from, buyToken: request.to, sellAmount: request.amount, slippageBps: request.slippageBps, taker: request.taker, fee },
    config.zeroExKey,
  );
  const [inUsd, outUsd] = await usdValues(request, result.buyAmount, config);
  const quote: SwapQuote = {
    chain: "rh",
    provider: "0x",
    inToken: request.from,
    outToken: request.to,
    inAmount: request.amount,
    outAmount: result.buyAmount,
    minOut: result.minBuyAmount,
    slippageBps: request.slippageBps,
    priceImpact: null,
    fee: result.integratorFee ? { bps: config.feeBps, amount: result.integratorFee.amount, token: result.integratorFee.token } : null,
    networkFee: result.networkFee,
    inUsd,
    outUsd,
    route: result.sources,
    tradingOpen: config.tradingOpen,
    quotedAt: Date.now(),
  };
  if (!withTx) return { quote };
  if (!result.transaction) throw new SwapError("unavailable", "0x: no transaction");
  const short = result.allowance && BigInt(result.allowance.actual) < BigInt(request.amount);
  const approval = short && result.allowance ? { token: request.from, spender: result.allowance.spender, amount: request.amount } : null;
  return { quote, build: { quote, evm: { approval, transaction: result.transaction } } };
}

/** An indicative quote: what the swap would return now, with fees and route. */
export async function quoteSwap(request: SwapRequest, config: SwapConfig): Promise<SwapQuote> {
  const planned = await (request.chain === "sol" ? solana(request, config, false) : robinhood(request, config, false));
  return planned.quote;
}

/** A firm quote and the transaction(s) for the taker's wallet to sign. Refused while trading is closed. */
export async function buildSwap(request: SwapRequest & { taker: string }, config: SwapConfig): Promise<SwapBuild> {
  if (!config.tradingOpen) throw new SwapError("closed", "trading is not open yet", 403);
  const planned = await (request.chain === "sol" ? solana(request, config, true) : robinhood(request, config, true));
  if (!planned.build) throw new SwapError("unavailable", "no transaction");
  return planned.build;
}
