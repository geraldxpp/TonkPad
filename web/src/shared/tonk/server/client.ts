import { createPublicClient, http, type PublicClient } from "viem";
import type { TonkNetwork } from "../networks";

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
      | "nothing",
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TonkError";
  }
}

const RPC_TIMEOUT_MS = 12_000;

/** The RPC the server reads the launchpad from: TONK_RPC_URL when set, else the network's public one. Never NEXT_PUBLIC_. */
export function tonkRpcUrl(network: TonkNetwork, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.TONK_RPC_URL?.trim() || network.rpcUrl;
}

let current: { url: string; client: PublicClient; verified: Promise<void> | null } | null = null;

/**
 * A viem client for the network, checked once to really be on its chain: an
 * RPC for another chain with these addresses would read (and build) nonsense,
 * so every Tonk route is "unavailable" until the two agree.
 */
export async function tonkClient(network: TonkNetwork): Promise<PublicClient> {
  const url = tonkRpcUrl(network);
  if (!current || current.url !== url) {
    current = { url, client: createPublicClient({ transport: http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 1, batch: { batchSize: 100 } }) }), verified: null };
  }
  const entry = current;
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
