import { createPublicClient, http, type PublicClient } from "viem";
import type { TonkNetwork } from "../networks";

export type ImageRefusal = "size" | "type" | "expired" | "signature" | "limit" | "unreadable" | "hidden";

/** Why a Tonk route refused, as a code the browser turns into words; never the upstream detail. */
export class TonkError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "unavailable"
      | "closed"
      | "paused"
      | "funds"
      | "refused"
      // Phase 2: not a mission; curve trading over; inside the launch-block shield; not enough tokens; not the creator; nothing to claim.
      | "missing"
      | "graduated"
      | "early"
      | "tokens"
      | "forbidden"
      | "nothing"
      // Mainnet: the launchpad graduates into a migrator this site wasn't deployed with.
      | "migrator"
      // A graduated token's pool: still on its curve; graduated but its pool not open yet.
      | "curve"
      | "pending"
      // The guarded launch: this site launches only for invited creators (the contract itself stays open).
      | "invite"
      // Token images: the file's size or type; the signature's age or match; the hourly limit; a file that doesn't decode; a hidden image.
      | ImageRefusal,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TonkError";
  }
}

const RPC_TIMEOUT_MS = 12_000;

/**
 * The RPC the server reads the launchpad from: TONK_RPC_URL when set; on
 * mainnet, else the site's own Robinhood Chain RPC (ROBINHOOD_RPC_URL); else
 * the network's public one. Never NEXT_PUBLIC_. A wrong chain is caught by
 * `tonkClient`'s check.
 */
export function tonkRpcUrl(network: TonkNetwork, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const site = network.chainId === 4663 ? env.ROBINHOOD_RPC_URL?.trim() : "";
  return env.TONK_RPC_URL?.trim() || site || network.rpcUrl;
}

/**
 * The RPC event logs are read from: TONK_LOGS_RPC_URL when set, else
 * TONK_RPC_URL, else the network's public one. Never the site's own RPC
 * (ROBINHOOD_RPC_URL): a provider's plan can cap eth_getLogs to a few
 * blocks (the site's allowed 10 on its free tier, about a second of
 * Robinhood Chain), while the public RPC answers the launchpad's whole
 * history in one read.
 */
export function tonkLogsRpcUrl(network: TonkNetwork, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.TONK_LOGS_RPC_URL?.trim() || env.TONK_RPC_URL?.trim() || network.rpcUrl;
}

const clients = new Map<string, { client: PublicClient; verified: Promise<void> | null }>();

/**
 * A viem client for the network, checked once to really be on its chain: an
 * RPC for another chain with these addresses would read (and build) nonsense,
 * so every Tonk route is "unavailable" until the two agree. Nothing is cached
 * (viem otherwise keeps the block number for 4 s): a sale built just after
 * its approval must not read the chain as it was before it.
 */
export function tonkClient(network: TonkNetwork): Promise<PublicClient> {
  return verifiedClient(network, tonkRpcUrl(network));
}

/** The same, on the RPC for event logs (see `tonkLogsRpcUrl`). */
export function tonkLogsClient(network: TonkNetwork): Promise<PublicClient> {
  return verifiedClient(network, tonkLogsRpcUrl(network));
}

async function verifiedClient(network: TonkNetwork, url: string): Promise<PublicClient> {
  let entry = clients.get(url);
  if (!entry) {
    entry = { client: createPublicClient({ cacheTime: 0, transport: http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 1, batch: { batchSize: 100 } }) }), verified: null };
    clients.set(url, entry);
  }
  entry.verified ??= entry.client.getChainId().then((chainId) => {
    if (chainId !== network.chainId) throw new TonkError("unavailable", `RPC is on chain ${chainId}, not ${network.chainId}`);
  });
  try {
    await entry.verified;
  } catch (error) {
    // Ask again next time: the RPC may only have been unreachable.
    entry.verified = null;
    throw error instanceof TonkError ? error : new TonkError("unavailable", "RPC unreachable");
  }
  return entry.client;
}
