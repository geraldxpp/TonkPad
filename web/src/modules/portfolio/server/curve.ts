import type { PublicClient } from "viem";
import { tokenPrice } from "@/shared/tonk/curve";
import { hiddenImages } from "@/shared/tonk/image";
import { decodeMetadata } from "@/shared/tonk/metadata";
import { isTestnetSite, type TonkNetwork, tonkNetwork } from "@/shared/tonk/networks";
import { LAUNCHPAD_ABI } from "@/shared/tonk/server/abi";
import { tonkClient } from "@/shared/tonk/server/client";
import { NO_CHANGE } from "../lib/types";
import type { DexPrice } from "./dex";

/** At most this many unpriced tokens are asked about per read: one batched call each. */
export const MAX_CURVE_LOOKUPS = 50;

/**
 * tonkfun.fun launches still on their curve, priced from the curve itself:
 * a real market, since anyone can sell into it (prompts/07-mainnet.md,
 * decision 8). Only tokens DexScreener doesn't price are asked about, and
 * only on mainnet. A graduated launch waits for its pool to be listed. By
 * lowercase address; anything that can't be read is simply left unpriced.
 */
export async function readCurvePrices(
  addresses: readonly string[],
  ethUsd: number | null,
  network: TonkNetwork | null = isTestnetSite() ? null : tonkNetwork(),
  connect: (network: TonkNetwork) => Promise<PublicClient> = tonkClient,
): Promise<Map<string, DexPrice>> {
  const prices = new Map<string, DexPrice>();
  const asked = [...new Set(addresses.map((address) => address.toLowerCase()))].slice(0, MAX_CURVE_LOOKUPS);
  if (!network || ethUsd === null || !(ethUsd > 0) || asked.length === 0) return prices;
  const client = await connect(network).catch(() => null);
  if (!client) return prices;
  const hidden = hiddenImages();
  const missions = await Promise.allSettled(asked.map((address) => client.readContract({ address: network.launchpad, abi: LAUNCHPAD_ABI, functionName: "missions", args: [address as `0x${string}`] })));
  missions.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const [token, , , , , , graduated, virtualEth, virtualTokens, , , , metadataUri] = result.value;
    if (token.toLowerCase() !== asked[index] || graduated || virtualTokens <= BigInt(0)) return;
    // Its art is the launch's own image, only if it is ours and not hidden (metadata past 4 KB isn't the app's).
    const art = metadataUri.length > 4_096 ? "" : decodeMetadata(metadataUri, hidden).image;
    prices.set(asked[index], { priceUsd: tokenPrice(virtualEth, virtualTokens) * ethUsd, change: NO_CHANGE, art });
  });
  return prices;
}
