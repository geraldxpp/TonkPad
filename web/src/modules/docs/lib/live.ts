import type { DocsSource } from "../data/get-docs-data";
import type { DocsFigures } from "./figures";

/**
 * The ETH price the page counts dollars at: "off" where it doesn't (the
 * testnet site and the demo), "pending" until the live data answers,
 * "unavailable" without one, else the price.
 */
export type UsdPrice = "off" | "pending" | "unavailable" | number;

/** What every live figure on the page reads: one read of the launchpad, shared. */
export interface DocsLiveValue {
  /** The figures for a new launch; null while the launchpad can't be read. */
  figures: DocsFigures | null;
  /** True until the first read of the launchpad has answered. */
  pending: boolean;
  source: DocsSource;
  chainName: string | null;
  unit: string;
  usd: UsdPrice;
}
