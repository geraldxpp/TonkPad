import { formatEther } from "viem";
import type { Address } from "./types";

export type Severity = "critical" | "warning" | "info";

/** One thing the owner should hear about. Every line is built here from chain numbers and addresses, never from a token's own text. */
export interface Alert {
  /** Sent once per key. A condition keeps its key while it lasts. */
  key: string;
  severity: Severity;
  title: string;
  lines: string[];
  /** A state that lasts (a shortfall, a revert, a lag): repeated while it lasts and resolved once it's gone. */
  condition?: boolean;
}

/** What detectors need to word an alert. */
export interface AlertContext {
  explorerUrl: string;
  launchpad: Address;
  migrator: Address;
  /** "$TICKER 0x12…cdef" for a known mission, else the short address. */
  token: (address: Address) => string;
}

const MAX_DECIMALS = 6;

/** "1.234567 ETH"; amounts too small for six decimals keep every digit, so a one-wei shortfall still shows. */
export function eth(wei: bigint): string {
  const negative = wei < BigInt(0);
  const exact = formatEther(negative ? BigInt(0) - wei : wei);
  const [whole, fraction = ""] = exact.split(".");
  const cut = fraction.slice(0, MAX_DECIMALS).replace(/0+$/, "");
  const shown = cut === "" && fraction !== "" ? exact : cut ? `${whole}.${cut}` : whole;
  return `${negative ? "-" : ""}${shown} ETH`;
}

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Text from outside the watcher (a revert reason, an RPC's error) as an alert
 * may quote it: printable ASCII without the characters chat apps format or
 * link with, at most 160 characters.
 */
export const plain = (text: string) => text.replace(/[^\x20-\x7E]|[`*_~|<>[\]@]/g, "").slice(0, 160);

export const txLink = (ctx: Pick<AlertContext, "explorerUrl">, hash: string) => `${ctx.explorerUrl}/tx/${hash}`;
export const addressLink = (ctx: Pick<AlertContext, "explorerUrl">, address: string) => `${ctx.explorerUrl}/address/${address}`;

/** How an address reads in an alert: the two watched contracts by name, anything else shortened. */
export function nameOf(ctx: Pick<AlertContext, "launchpad" | "migrator">, address: Address): string {
  if (address === ctx.launchpad) return "the launchpad";
  if (address === ctx.migrator) return "the migrator";
  return short(address);
}

export const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
