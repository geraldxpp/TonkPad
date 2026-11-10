import { cache } from "react";
import { isEvmAddress } from "@/shared/lib/address";
import { tonkNetwork } from "@/shared/tonk/networks";
import { TonkError } from "@/shared/tonk/server/client";
import { readMissionPage } from "@/shared/tonk/server/mission";
import type { MissionLoad } from "../hooks/useMissionPage";

/**
 * A mission read from the launchpad for the testnet site's token page: its
 * state and newest trades, straight from the chain. An address the launchpad
 * doesn't know is "not found"; an unreachable chain is "unavailable", and
 * the page goes on trying from the browser. Never mock data.
 */
export const getMissionData = cache(async (address: string): Promise<MissionLoad> => {
  const network = tonkNetwork();
  if (!network || !isEvmAddress(address)) return { status: "not-found" };
  try {
    return { status: "ok", page: await readMissionPage(network, address) };
  } catch (error) {
    return { status: error instanceof TonkError && error.code === "missing" ? "not-found" : "unavailable" };
  }
});
