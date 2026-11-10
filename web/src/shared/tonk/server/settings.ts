import { cached } from "@/shared/swap/server/cache";
import type { TonkNetwork } from "../networks";
import type { TonkSettingsJson } from "../types";
import { LAUNCHPAD_ABI } from "./abi";
import { TonkError, tonkClient } from "./client";

/**
 * The launchpad's settings for new launches, straight from the contract:
 * the launch fee, the virtual reserves, whether it is paused, and the
 * chain's gas price. Identical reads within `maxAgeMs` share one round trip.
 */
export function readSettings(network: TonkNetwork, maxAgeMs = 5_000): Promise<TonkSettingsJson> {
  return cached(`tonk:settings:${network.chainId}`, maxAgeMs, async () => {
    const client = await tonkClient(network);
    const read = (functionName: "launchFee" | "defaultVirtualEth" | "defaultVirtualTokens" | "paused") =>
      client.readContract({ address: network.launchpad, abi: LAUNCHPAD_ABI, functionName });
    try {
      const [launchFee, virtualEth, virtualTokens, paused, gasPrice] = await Promise.all([
        read("launchFee"),
        read("defaultVirtualEth"),
        read("defaultVirtualTokens"),
        read("paused"),
        client.getGasPrice().catch(() => null),
      ]);
      return {
        chainId: network.chainId,
        launchFee: String(launchFee),
        virtualEth: String(virtualEth),
        virtualTokens: String(virtualTokens),
        paused: paused === true,
        gasPrice: gasPrice === null ? null : String(gasPrice),
        readAt: Date.now(),
      };
    } catch {
      throw new TonkError("unavailable", "launchpad settings unreadable");
    }
  });
}
