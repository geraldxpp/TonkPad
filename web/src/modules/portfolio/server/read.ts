import { cached } from "@/shared/swap/server/cache";
import type { ChainId } from "@/shared/types/chain";
import type { ActivityPage, ChainPortfolio } from "../lib/types";
import { readSolanaActivity } from "./activity";
import { readRobinhoodActivity } from "./activity-rh";
import { readRobinhoodPortfolio } from "./robinhood";
import { readSolanaPortfolio } from "./solana";

/** One wallet's refreshes on one instance within this window share a read. */
const PORTFOLIO_MS = 10_000;
const ACTIVITY_MS = 20_000;

/** Everything one wallet holds on one chain. The address must already be validated. */
export function readPortfolio(chain: ChainId, owner: string): Promise<ChainPortfolio> {
  return cached(`portfolio:${chain}:${owner}`, PORTFOLIO_MS, () => (chain === "sol" ? readSolanaPortfolio(owner) : readRobinhoodPortfolio(owner)));
}

/** A page of one wallet's history on one chain. The address must already be validated. */
export function readActivity(chain: ChainId, owner: string, cursor: string | null): Promise<ActivityPage> {
  return cached(`portfolio:activity:${chain}:${owner}:${cursor ?? ""}`, ACTIVITY_MS, () => (chain === "sol" ? readSolanaActivity(owner, cursor) : readRobinhoodActivity(owner, cursor)));
}
