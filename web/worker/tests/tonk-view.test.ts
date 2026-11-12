// @vitest-environment node
import { decodeEventLog, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { isLiveTokenDetail } from "@/modules/token/lib/live-token";
import { TOTAL_SUPPLY } from "@/shared/tonk/curve";
import type { RawLog } from "../src/alerts/types";
import { TokenStore } from "../src/store";
import { FEED_EVENTS, POOL_EVENTS } from "../src/tonk/abi";
import { TonkBook } from "../src/tonk/book";
import { CONFIRMATIONS, TonkFeed } from "../src/tonk/feed";
import type { TonkToken } from "../src/tonk/launch";
import { tonkHolders, tonkTraderRows } from "../src/tonk/view";
import { tokenView } from "../src/views/token";
import { NOW } from "./fixtures";
import { LAUNCHPAD, POOL_MANAGER, type TonkChain } from "./tonk-chain";
import { CONFIG, FakeRpc, SYSTEM } from "./tonk-rpc";
import { ALICE, BOB, CAROL, CREATOR, DAVE, ERIN, MARKS, poolIdFor, SNIPER, TOKEN, tonkScenario } from "./tonk-scenario";

const ETH_USD = 3_000;
const eth = (wei: bigint) => Number(wei) / 1e18;
const noSmart = () => false;

async function followed(chain: TonkChain, last: number): Promise<TonkToken> {
  const store = new TokenStore();
  const rpc = new FakeRpc(chain, last + CONFIRMATIONS + 1);
  const book = new TonkBook(store, SYSTEM);
  const feed = new TonkFeed(rpc, CONFIG, book);
  while ((feed.cursor ?? 0) < rpc.head - CONFIRMATIONS) await feed.poll();
  book.refresh(NOW, ETH_USD);
  return store.get(TOKEN) as TonkToken;
}

/** Each wallet's ETH in and out, worked from the logs themselves (a router's pool trades by its taker). */
function flowsOf(logs: readonly RawLog[]): Map<string, { in: number; out: number }> {
  const flows = new Map<string, { in: number; out: number }>();
  const add = (wallet: string, key: "in" | "out", value: number) => flows.set(wallet, { in: 0, out: 0, ...flows.get(wallet), [key]: (flows.get(wallet)?.[key] ?? 0) + value });
  const pool = poolIdFor(TOKEN);
  const takers = [ERIN, ALICE];
  for (const log of logs) {
    const topics = log.topics as [Hex, ...Hex[]];
    if (log.address === LAUNCHPAD) {
      const { eventName, args } = decodeEventLog({ abi: FEED_EVENTS, data: log.data as Hex, topics });
      if (eventName === "BundleTaxCollected") add(args.sniper.toLowerCase(), "in", eth(args.penaltyEth));
      if (eventName === "CurveTrade" && args.token.toLowerCase() === TOKEN) add(args.trader.toLowerCase(), args.isBuy ? "in" : "out", eth(args.isBuy ? args.grossEth : args.grossEth - args.protocolFee - args.crewFee - args.creatorFee));
    }
    if (log.address === POOL_MANAGER && log.topics[1] === pool) {
      const { args } = decodeEventLog({ abi: POOL_EVENTS, data: log.data as Hex, topics });
      const buy = args.amount0 < BigInt(0);
      add(takers.shift() as string, buy ? "in" : "out", eth(buy ? -args.amount0 : args.amount0));
    }
  }
  return flows;
}

describe("a tonkfun.fun launch's holders and top traders, from its feed", () => {
  it("labels the system holders and leaves them out of the count: on the curve, the curve and the creator's locked tokens", async () => {
    const chain = tonkScenario();
    const token = await followed(chain, MARKS.transferred);
    const rows = tonkHolders(token, SYSTEM, noSmart);
    const labelled = rows.filter((row) => row.label);
    expect(labelled.map((row) => [row.label, row.tag])).toEqual([["curve", "curve"], ["locked", "devLock"]]);
    const locked = chain.at(MARKS.transferred).lock[4];
    expect(labelled[1].tokens).toBeCloseTo(eth(locked), 3);
    // The launchpad's whole balance is the two rows: the curve's and the creator's.
    expect(labelled[0].tokens + labelled[1].tokens).toBeCloseTo(eth(BigInt(token.tonk.balances[LAUNCHPAD])), 3);
    const counted = rows.filter((row) => !row.label);
    expect(counted).toHaveLength(token.holderCount ?? -1);
    expect(counted.map((row) => row.address)).toEqual(expect.arrayContaining([CREATOR, ALICE, BOB, CAROL, SNIPER]));
    expect(counted.find((row) => row.address === SNIPER)?.tag).toBe("sniper");
    expect(rows.map((row) => row.tokens)).toEqual([...rows.map((row) => row.tokens)].sort((a, b) => b - a));
  });

  it("after graduation: the pool's tokens and the creator's lock labelled, every share of the whole supply", async () => {
    const chain = tonkScenario();
    const token = await followed(chain, MARKS.end);
    const rows = tonkHolders(token, SYSTEM, noSmart);
    // The curve sold out and the migrator passed everything on; the 1,000 wei it burned is dust.
    expect(rows.filter((row) => row.label).map((row) => row.label).sort()).toEqual(["locked", "pool"]);
    const pool = rows.find((row) => row.label === "pool")!;
    expect(pool.share).toBeCloseTo(Number((BigInt(token.tonk.balances[POOL_MANAGER]) * BigInt(1_000_000)) / TOTAL_SUPPLY) / 1e6, 6);
    expect(rows.find((row) => row.address === ERIN)?.tokens).toBeGreaterThan(0);
  });

  it("ranks top traders by realised profit across curve and pool, with ETH in and out and what each still holds", async () => {
    const chain = tonkScenario();
    const token = await followed(chain, MARKS.end);
    const traders = tonkTraderRows(token, ETH_USD, noSmart);
    const expected = flowsOf(chain.logs);
    expect(traders.map((row) => row.address).sort()).toEqual([...expected.keys()].sort());
    for (const row of traders) {
      expect(row.boughtUsd / ETH_USD, row.address).toBeCloseTo(expected.get(row.address)!.in, 9);
      expect(row.soldUsd / ETH_USD, row.address).toBeCloseTo(expected.get(row.address)!.out, 9);
    }
    // Alice sold everything she bought, half on the curve and half on the pool: her profit is out less in.
    const alice = traders[0];
    expect(alice.address).toBe(ALICE);
    expect(alice.pnlUsd).toBeCloseTo(alice.soldUsd - alice.boughtUsd, 6);
    expect([alice.held, alice.winRate]).toEqual([0, 1]);
    // The pool buy went through the router: it counts for Erin, who took the tokens.
    expect(traders.find((row) => row.address === ERIN)?.held).toBeCloseTo(eth(chain.balances.get(ERIN) ?? BigInt(0)), 3);
    // The graduating buy counts what the curve took, not the 5 ETH sent (the rest came back).
    expect(traders.find((row) => row.address === DAVE)!.boughtUsd / ETH_USD).toBeLessThan(5);
    // The sniper paid the shield's 99% too; nobody else is tagged.
    expect(traders.find((row) => row.address === SNIPER)).toMatchObject({ tag: "sniper", boughtUsd: 0.1 * ETH_USD, pnlUsd: 0 });
    expect(tonkTraderRows(token, null, noSmart)).toEqual([]);
  });

  it("answers the token page with a detail the app accepts: holders, top traders, the count and the top-10 share", async () => {
    const chain = tonkScenario();
    const token = await followed(chain, MARKS.end);
    const status = { solUsd: null, ethUsd: ETH_USD, rhGasGwei: null };
    const detail = tokenView(token, status, NOW, { tonk: SYSTEM });
    expect(isLiveTokenDetail(JSON.parse(JSON.stringify(detail)), TOKEN)).toBe(true);
    expect(detail.holders.some((row) => row.label === "locked")).toBe(true);
    expect(detail.topTraders[0].held).toBe(0);
    expect(detail.token.holders).toBe(token.holderCount);
    expect(detail.stats.top10Share).toBe(token.top10Share);
    expect(detail.supply).toBe(1e9);
    // Without the system addresses the page gets no rows rather than unlabelled ones.
    expect(tokenView(token, status, NOW).holders).toEqual([]);
  });
});
