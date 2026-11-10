import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, type PublicClient } from "viem";
import { isEvmAddress } from "@/shared/lib/address";
import type { UnsignedTx } from "../types";
import { TonkError } from "./client";

/** Gas is estimated, then padded: Robinhood Chain's price moves with its parent chain's data cost. */
const GAS_MARGIN = { numerator: BigInt(13), denominator: BigInt(10) };

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

/** An estimate with the margin every built transaction carries. */
export const padGas = (estimate: bigint) => (estimate * GAS_MARGIN.numerator) / GAS_MARGIN.denominator;

/** The wallet must cover what the call sends plus its gas at the current price. */
export async function requireFunds(client: PublicClient, account: Address, value: bigint, gas: bigint): Promise<void> {
  const [balance, gasPrice] = await Promise.all([client.getBalance({ address: account }), client.getGasPrice()]).catch(() => {
    throw new TonkError("unavailable", "balance unreadable");
  });
  if (balance < value + gas * gasPrice) throw new TonkError("funds", "not enough ETH for this and its gas", 409);
}

export const unsigned = (to: string, data: string, value: bigint, gas: bigint): UnsignedTx => ({ to, data, value: String(value), gas: String(gas) });
