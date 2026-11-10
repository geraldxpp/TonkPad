import type { MissionAccountJson } from "../mission";
import type { TonkNetwork } from "../networks";
import { LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { TonkError, tonkClient } from "./client";
import { readMission } from "./mission";

/**
 * A wallet's standing on a mission: its coin and tokens, what the launchpad
 * may take for a sell, its unpaid Crew Rewards (never `rewardDebt`, which is
 * an internal checkpoint), and any ETH the launchpad is holding for it.
 */
export async function readAccount(network: TonkNetwork, token: string, owner: string): Promise<MissionAccountJson> {
  const mission = await readMission(network, token, 5_000);
  const client = await tonkClient(network);
  const account = owner as `0x${string}`;
  const coin = { address: mission.token as `0x${string}`, abi: TOKEN_ABI } as const;
  try {
    const [eth, tokens, allowance, unpaidRewards, unpaidEth] = await Promise.all([
      client.getBalance({ address: account }),
      client.readContract({ ...coin, functionName: "balanceOf", args: [account] }),
      client.readContract({ ...coin, functionName: "allowance", args: [account, network.launchpad] }),
      client.readContract({ ...coin, functionName: "viewUnpaidRewards", args: [account] }),
      client.readContract({ address: network.launchpad, abi: LAUNCHPAD_ABI, functionName: "claimableEth", args: [account] }),
    ]);
    return {
      owner,
      eth: String(eth),
      tokens: String(tokens),
      allowance: String(allowance),
      unpaidRewards: String(unpaidRewards),
      unpaidEth: String(unpaidEth),
      isCreator: mission.creator.toLowerCase() === owner.toLowerCase(),
      readAt: Date.now(),
    };
  } catch {
    throw new TonkError("unavailable", "account unreadable");
  }
}
