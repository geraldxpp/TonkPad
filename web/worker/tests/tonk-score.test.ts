// @vitest-environment node
import { decodeEventLog, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { missionDetail } from "@/modules/token/lib/mission-detail";
import { DAY_SECONDS } from "@/shared/tonk/lock";
import type { MissionPageJson, MissionTradeJson } from "@/shared/tonk/mission";
import { mainnetNetwork } from "@/shared/tonk/networks";
import { TokenStore } from "../src/store";
import { TonkBook } from "../src/tonk/book";
import { CONFIRMATIONS, TonkFeed } from "../src/tonk/feed";
import { FEED_EVENTS } from "../src/tonk/abi";
import { toToken } from "../src/tokens";
import { NOW } from "./fixtures";
import { LAUNCHPAD, MIGRATOR, type TonkChain } from "./tonk-chain";
import { CONFIG, FakeRpc, SYSTEM } from "./tonk-rpc";
import { AGENT, CREATOR, LAUNCH_BLOCK, LAUNCH_TIME, MARKS, TOKEN, tonkScenario } from "./tonk-scenario";

const NETWORK = mainnetNetwork({ launchpad: LAUNCHPAD, migrator: MIGRATOR, block: String(CONFIG.startBlock) })!;

/** The token page's reading of the same chain at `block`: the mission as stored, and its curve trades newest first. */
function pageAt(chain: TonkChain, block: number, readAt: number): MissionPageJson {
  const state = chain.at(block);
  const [, lockedBps, start, end, total, claimed] = state.lock;
  const trades: MissionTradeJson[] = chain.logs
    .filter((log) => log.address === LAUNCHPAD && Number(BigInt(log.blockNumber)) <= block)
    .flatMap((log) => {
      const { eventName, args } = decodeEventLog({ abi: FEED_EVENTS, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      if (eventName !== "CurveTrade") return [];
      const fees = args.protocolFee + args.crewFee + args.creatorFee;
      const at = Number(BigInt(log.blockNumber));
      return [{ id: `${log.transactionHash}:${log.logIndex}`, tx: log.transactionHash, side: args.isBuy ? "buy" : "sell", trader: args.trader, eth: String(args.grossEth), tokens: String(args.tokenAmount), fees: String(fees), virtualEth: String(args.newVirtualEth), virtualTokens: String(args.newVirtualTokens), block: at, time: chain.timeOf(at) } satisfies MissionTradeJson];
    })
    .reverse();
  const c = state.curve;
  return {
    mission: {
      chainId: 4663, token: TOKEN, name: "Tonk Test One", symbol: "TONK", creator: CREATOR, launchedAt: LAUNCH_TIME, launchBlock: LAUNCH_BLOCK,
      crewBps: chain.crewBps, creatorBps: chain.creatorBps, graduated: state.graduated, paused: false, virtualEth: String(c.virtualEth), virtualTokens: String(c.virtualTokens),
      realEth: String(c.realEth), tokensLeft: String(c.tokensLeft), eligibleSupply: "0", crewPaid: "0", metadata: "", agentPrompt: AGENT,
      lock: { type: "linear", lockedBps, start: Number(start), end: Number(end), total: String(total), claimed: String(claimed), checkpoint: "0" },
      creatorHeld: String(chain.balances.get(CREATOR) ?? BigInt(0)), block, pool: null, buyingOpen: true, readAt,
    },
    trades,
  };
}

async function followed(chain: TonkChain, head: number) {
  const store = new TokenStore();
  const rpc = new FakeRpc(chain, head);
  const feed = new TonkFeed(rpc, CONFIG, new TonkBook(store, SYSTEM));
  while ((feed.cursor ?? 0) < head - CONFIRMATIONS) await feed.poll();
  return store.get(TOKEN)!;
}

/** From the first ten minutes to past the vest's end, across the moments its points and the badge change. */
const AGES = [0.002, 0.04, 1, 29.5, 30.5, 75, 89.5, 90.5, 149.5, 150.5, 172.5, 173.5, 181];

describe("a tonkfun.fun launch's Mission score: Explore and its token page agree", () => {
  it("over the lock's whole life, after the creator's claim", async () => {
    const chain = tonkScenario();
    const token = await followed(chain, MARKS.end + CONFIRMATIONS + 1);
    for (const days of AGES) {
      const at = (LAUNCH_TIME + Math.round(days * DAY_SECONDS)) * 1000;
      const page = missionDetail(pageAt(chain, MARKS.end, at), NETWORK, 3_000).token;
      const listed = toToken(token, at);
      expect([listed.score, listed.level], `day ${days}`).toEqual([page.score, page.level]);
      expect(listed.flags.locked, `day ${days}, Locked badge`).toBe(page.flags.locked);
      expect(listed.flags.crew, `day ${days}, Crew badge`).toBe(page.flags.crew);
      expect(listed.flags.agent).toBe(page.flags.agent);
    }
  });

  it("before graduation too, with the creator's tokens as the launch left them", async () => {
    const chain = tonkScenario();
    const token = await followed(chain, MARKS.transferred + CONFIRMATIONS + 1);
    const page = pageAt(chain, MARKS.transferred, NOW);
    // The creator holds the launch buy's unlocked 20% here.
    page.mission.creatorHeld = String(BigInt(token.tonk!.devBought) - chain.at(MARKS.transferred).lock[4]);
    const listed = toToken(token, NOW);
    const shown = missionDetail(page, NETWORK, 3_000).token;
    expect([listed.score, listed.level]).toEqual([shown.score, shown.level]);
    expect(listed.score).toBeGreaterThanOrEqual(75);
  });
});
