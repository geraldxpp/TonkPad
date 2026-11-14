import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, type PublicClient } from "viem";
import { isEvmAddress } from "@/shared/lib/address";
import type { TonkNetwork } from "../networks";
import type { UnsignedTx } from "../types";
import { LAUNCHPAD_ABI } from "./abi";
import { TonkError } from "./client";

/** Gas is estimated, then padded: Robinhood Chain's price moves with its parent chain's data cost. */
const GAS_MARGIN = { numerator: BigInt(13), denominator: BigInt(10) };
/**
 * A launch's margin. The first mainnet launch was built from an estimate
 * about 22% under what it used (it had 0.89% to spare) and the cause wasn't
 * found, so launches get more room. The chain charges only the gas used.
 */
export const LAUNCH_GAS_MARGIN = { numerator: BigInt(16), denominator: BigInt(10) };

export type Address = `0x${string}`;
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export const invalid = (what: string) => new TonkError("invalid", what, 400);
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A string field no longer than `max`. */
export function text(value: unknown, max: number, what: string): string {
  if (typeof value !== "string" || value.length > max) throw invalid(what);
  return value;
}

/** An EVM address field. */
export function address(value: unknown, what: string): Address {
  if (typeof value !== "string" || !isEvmAddress(value)) throw invalid(what);
  return value as Address;
}

/** A wei amount as a decimal string: digits only, no leading zero, at most 30 of them. */
export function wei(value: unknown, what: string, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,29})$/.test(value) || (!allowZero && value === "0")) throw invalid(what);
  return BigInt(value);
}

/** Why a simulated call didn't go through, in the app's terms. Never the node's own wording. */
export function refusal(error: unknown): TonkError {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof InsufficientFundsError)) return new TonkError("funds", "not enough ETH", 409);
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name === "EnforcedPause") return new TonkError("paused", "the launchpad is paused", 409);
      if (name === "ERC20InsufficientBalance") return new TonkError("tokens", "not enough tokens", 409);
      if (/graduated/i.test(revert.reason ?? "")) return new TonkError("graduated", "curve trading is over", 409);
      return new TonkError("refused", revert.reason ?? name ?? "reverted", 409);
    }
    if (/insufficient funds|exceeds (the )?balance/i.test(error.message)) return new TonkError("funds", "not enough ETH", 409);
    if (/revert/i.test(error.message)) return new TonkError("refused", "reverted", 409);
  }
  return new TonkError("unavailable", "simulation failed");
}

/**
 * A buy or a launch can complete a curve, which sends that curve's ETH and
 * pool tokens to the launchpad's migrator. Neither is built unless that is
 * still the migrator this site was deployed with (prompts/07-mainnet.md,
 * decision 2). Sells and claims never graduate a curve, so holders can
 * always leave whatever this says.
 */
export async function requireDeployedMigrator(client: PublicClient, network: TonkNetwork, blockNumber?: bigint): Promise<void> {
  let migrator: string;
  try {
    migrator = await client.readContract({ address: network.launchpad, abi: LAUNCHPAD_ABI, functionName: "graduationMigrator", ...(blockNumber === undefined ? {} : { blockNumber }) });
  } catch {
    throw new TonkError("unavailable", "migrator unreadable");
  }
  if (migrator.toLowerCase() !== network.migrator.toLowerCase()) throw new TonkError("migrator", "the launchpad graduates into a migrator this site doesn't know", 409);
}

/** After an approval the chain is read again, at most this many times a second apart, until it reaches the approval's block. */
const CATCH_UP_TRIES = 5;
const CATCH_UP_MS = 1_000;
/** How often a just-confirmed approval's receipt is asked for again before the sale gives up. */
const RECEIPT_TRIES = 3;
const RECEIPT_WAIT_MS = 1_000;

/** The chain's head, never cached; after an approval, no earlier than its block (an RPC replica can lag a moment). */
export async function headAtLeast(client: PublicClient, floor: bigint | null): Promise<bigint> {
  for (let attempt = 0; ; attempt += 1) {
    const head = await client.getBlockNumber({ cacheTime: 0 }).catch(() => {
      throw new TonkError("unavailable", "block unreadable");
    });
    if (floor === null || head >= floor) return head;
    if (attempt >= CATCH_UP_TRIES) throw new TonkError("unavailable", "the chain hasn't reached the approval yet");
    await new Promise((resolve) => setTimeout(resolve, CATCH_UP_MS));
  }
}

/**
 * A just-confirmed approval's receipt, for a sale on the curve or on a pool.
 * The page saw it confirmed, but this read may reach a replica a moment
 * behind, or fail outright: asked again a few times before giving up.
 */
export async function approvalReceipt(client: PublicClient, hash: `0x${string}`) {
  for (let attempt = 0; ; attempt += 1) {
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt;
    if (attempt >= RECEIPT_TRIES) throw new TonkError("unavailable", "approval receipt unreadable");
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_WAIT_MS));
  }
}

/** An estimate with the margin every built transaction carries. */
export const padGas = (estimate: bigint, margin: { numerator: bigint; denominator: bigint } = GAS_MARGIN) => (estimate * margin.numerator) / margin.denominator;

/** The wallet must cover what the call sends plus its gas at the current price. */
export async function requireFunds(client: PublicClient, account: Address, value: bigint, gas: bigint): Promise<void> {
  const [balance, gasPrice] = await Promise.all([client.getBalance({ address: account }), client.getGasPrice()]).catch(() => {
    throw new TonkError("unavailable", "balance unreadable");
  });
  if (balance < value + gas * gasPrice) throw new TonkError("funds", "not enough ETH for this and its gas", 409);
}

export const unsigned = (to: string, data: string, value: bigint, gas: bigint): UnsignedTx => ({ to, data, value: String(value), gas: String(gas) });
