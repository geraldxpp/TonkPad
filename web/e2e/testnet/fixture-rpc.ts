import { createServer } from "node:http";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, type Hex, toEventSelector } from "viem";
import { TONK_TESTNET } from "../../src/shared/tonk/networks";
import { ARBSYS, ARBSYS_ABI, LAUNCHPAD_ABI, TOKEN_ABI } from "../../src/shared/tonk/server/abi";
import { MIGRATOR_ABI } from "../../src/shared/tonk/server/pool";
import { BLOCK, type FixtureMission, type FixtureTrade, MISSIONS, ZERO } from "./fixture-chain";
import { FIXTURE_LAUNCHPAD, MAINNET_DEPLOYMENT, MAINNET_LAUNCHPAD, MAINNET_RPC_PORT, STUB_BALANCE, STUB_WALLET, TESTNET_RPC_PORT } from "./fixtures";

/**
 * A local JSON-RPC stand-in for Robinhood Chain Testnet. It answers what the
 * app reads: the chain id, gas price and block, a wallet's balance, the
 * launchpad's settings, its missions with their locks and trades, and each
 * token's balances and Crew figures. Anything that would simulate, estimate
 * or send a transaction is refused, so no test can trade or launch through
 * it: those answers are given in the browser, by the test itself.
 */
const hex = (value: string | number | bigint): Hex => `0x${BigInt(value).toString(16)}`;
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
// FIXTURE_CHAIN=mainnet serves the same missions as Robinhood Chain mainnet, for the mainnet-mode run.
const MAINNET = process.env.FIXTURE_CHAIN === "mainnet";
const PAD = MAINNET ? MAINNET_DEPLOYMENT.launchpad : TONK_TESTNET.launchpad;
const MIGRATOR = MAINNET ? MAINNET_DEPLOYMENT.migrator : TONK_TESTNET.migrator;
const SETTINGS = MAINNET ? MAINNET_LAUNCHPAD : FIXTURE_LAUNCHPAD;
const missionOf = (token: unknown) => MISSIONS.find((mission) => same(mission.token, String(token)));
const big = (value: string | number) => BigInt(value);

/** The launchpad's view functions, by name; a transaction's function finds no answer here. */
function launchpadCall(data: Hex): Hex {
  const { functionName, args } = decodeFunctionData({ abi: LAUNCHPAD_ABI, data });
  const result = (value: unknown) => encodeFunctionResult({ abi: LAUNCHPAD_ABI, functionName, result: value } as never);
  const mission = missionOf(args?.[0]);
  switch (functionName) {
    case "launchFee":
      return result(big(SETTINGS.launchFee));
    case "defaultVirtualEth":
      return result(big(SETTINGS.virtualEth));
    case "defaultVirtualTokens":
      return result(big(SETTINGS.virtualTokens));
    case "paused":
      return result(false);
    case "graduationMigrator":
      return result(MIGRATOR);
    case "missions": {
      // An address the launchpad has never launched comes back as an empty record.
      if (!mission) return result([ZERO, ZERO, big(0), big(0), 0, 0, false, big(0), big(0), big(0), big(0), ZERO, "", ""]);
      const m = mission;
      return result([m.token, m.creator, big(m.launchedAt), big(m.launchBlock), m.crewBps, m.creatorBps, m.graduated, big(m.virtualEth), big(m.virtualTokens), big(m.realEth), big(m.tokensLeft), ZERO, m.metadata, m.agentPrompt]);
    }
    case "devLocks": {
      const [type, bps, start, end, total, claimed] = mission?.lock ?? [0, 0, 0, 0, "0", "0"];
      return result([type, bps, big(start), big(end), big(total), big(claimed)]);
    }
    case "devVestedCheckpoint":
    case "claimableEth":
      return result(big(0));
    default:
      throw new Error(`the fixture won't run ${functionName}`);
  }
}

/** A mission token's view functions. The stub wallet's standing is the mission's own; the creator holds `creatorHeld`. */
function tokenCall(mission: FixtureMission, data: Hex): Hex {
  const { functionName, args } = decodeFunctionData({ abi: TOKEN_ABI, data });
  const result = (value: unknown) => encodeFunctionResult({ abi: TOKEN_ABI, functionName, result: value } as never);
  const holder = String(args?.[0] ?? "");
  const stub = same(holder, STUB_WALLET);
  switch (functionName) {
    case "name":
      return result(mission.name);
    case "symbol":
      return result(mission.symbol);
    case "eligibleSupply":
      return result(big(mission.eligibleSupply));
    case "isExcludedFromCrew":
      return result(false);
    case "totalCrewRewardsPaid":
      return result(big(mission.crewPaid));
    case "balanceOf":
      return result(big(stub ? mission.stub.tokens : same(holder, mission.creator) ? mission.creatorHeld : 0));
    case "allowance":
      return result(big(stub && same(String(args?.[1]), PAD) ? mission.stub.allowance : 0));
    case "viewUnpaidRewards":
      return result(big(stub ? mission.stub.unpaidRewards : 0));
    default:
      throw new Error(`the fixture won't run ${functionName}`);
  }
}

/** The migrator's view of a graduated mission's pool: its key (ETH against the token, the guard as hook) and the position seeded there. */
function migratorCall(data: Hex): Hex {
  const { functionName, args } = decodeFunctionData({ abi: MIGRATOR_ABI, data });
  const result = (value: unknown) => encodeFunctionResult({ abi: MIGRATOR_ABI, functionName, result: value } as never);
  const token = String(args?.[0]);
  const mission = missionOf(token);
  const fee = mission ? (100 + mission.crewBps + mission.creatorBps) * 100 : 0;
  switch (functionName) {
    case "poolKey":
      return result({ currency0: ZERO, currency1: token, fee: Number(args?.[1]), tickSpacing: 60, hooks: MAINNET_DEPLOYMENT.guard });
    case "lockedPositions":
      return result([mission?.token ?? ZERO, mission?.creator ?? ZERO, big(mission?.graduated ? 7 : 0), mission?.crewBps ?? 0, mission?.creatorBps ?? 0, fee, big(0), big(0), mission?.graduated === true]);
    default:
      throw new Error(`the fixture won't run ${functionName}`);
  }
}

function call(to: string, data: Hex): Hex {
  if (same(to, PAD)) return launchpadCall(data);
  if (same(to, MIGRATOR)) return migratorCall(data);
  if (same(to, ARBSYS)) return encodeFunctionResult({ abi: ARBSYS_ABI, functionName: "arbBlockNumber", result: big(BLOCK) });
  const mission = missionOf(to);
  if (mission) return tokenCall(mission, data);
  throw new Error(`no contract at ${to}`);
}

const TOPIC = { launched: toEventSelector(LAUNCHPAD_ABI.find((item) => item.type === "event" && item.name === "MissionLaunched") as never), trade: toEventSelector(LAUNCHPAD_ABI.find((item) => item.type === "event" && item.name === "CurveTrade") as never) };
const plain = (eventName: string) => {
  const event = LAUNCHPAD_ABI.find((item) => item.type === "event" && item.name === eventName);
  if (!event || event.type !== "event") throw new Error(`no event ${eventName}`);
  return event.inputs.filter((input) => !("indexed" in input && input.indexed));
};

/** A log as a node returns it. */
function log(topics: readonly unknown[], data: Hex, block: number, tx: string, index: number) {
  return { address: PAD, topics, data, blockNumber: hex(block), blockHash: `0x${"b".repeat(64)}`, transactionHash: tx, transactionIndex: "0x0", logIndex: hex(index), removed: false };
}
const launchedLog = (m: FixtureMission) =>
  log(
    encodeEventTopics({ abi: LAUNCHPAD_ABI, eventName: "MissionLaunched", args: { token: m.token, creator: m.creator } } as never),
    encodeAbiParameters(plain("MissionLaunched"), [m.name, m.symbol, m.metadata, m.crewBps, m.creatorBps, m.lock[0], m.lock[1], big(m.lock[3]), big(m.trades[0]?.eth ?? 0)] as never),
    m.launchBlock,
    m.trades[0]?.tx ?? `0x${m.token.slice(2, 4).repeat(32)}`,
    0,
  );
const tradeLog = (m: FixtureMission, t: FixtureTrade, index: number) =>
  log(
    encodeEventTopics({ abi: LAUNCHPAD_ABI, eventName: "CurveTrade", args: { token: m.token, trader: t.trader } } as never),
    encodeAbiParameters(plain("CurveTrade"), [t.isBuy, big(t.eth), big(t.tokens), big(t.protocolFee), big(t.crewFee), big(t.creatorFee), big(t.virtualEth), big(t.virtualTokens), big(t.left)] as never),
    t.block,
    t.tx,
    index + 1,
  );

/** eth_getLogs for the launchpad's two events, within the block range asked for. */
function logs(filter: { address?: string; topics?: (string | null)[]; fromBlock?: string; toBlock?: string }) {
  if (filter.address && !same(filter.address, PAD)) return [];
  const [topic, token] = filter.topics ?? [];
  const from = Number(BigInt(filter.fromBlock ?? "0x0"));
  const to = filter.toBlock && filter.toBlock.startsWith("0x") ? Number(BigInt(filter.toBlock)) : BLOCK;
  const inRange = (entry: { blockNumber: Hex }) => Number(BigInt(entry.blockNumber)) >= from && Number(BigInt(entry.blockNumber)) <= to;
  if (topic === TOPIC.launched) return MISSIONS.map(launchedLog).filter(inRange);
  if (topic === TOPIC.trade) return MISSIONS.filter((mission) => !token || same(`0x${token.slice(-40)}`, mission.token)).flatMap((mission) => mission.trades.map((trade, index) => tradeLog(mission, trade, index))).filter(inRange);
  throw new Error("unexpected log filter");
}

/** When each block the fixture knows was made: a mission's launch block, or one of its trades. */
function blockTime(block: number): number {
  for (const mission of MISSIONS) {
    if (mission.launchBlock === block) return mission.launchedAt;
    const trade = mission.trades.find((entry) => entry.block === block);
    if (trade) return trade.time;
  }
  return Math.floor(Date.now() / 1000);
}
const WORD = `0x${"0".repeat(64)}`;
const blockAt = (block: number) => ({
  number: hex(block), hash: `0x${"b".repeat(64)}`, parentHash: WORD, timestamp: hex(blockTime(block)), nonce: "0x0000000000000000", difficulty: "0x0", totalDifficulty: "0x0", gasLimit: "0x1", gasUsed: "0x0",
  miner: ZERO, extraData: "0x", logsBloom: `0x${"0".repeat(512)}`, mixHash: WORD, receiptsRoot: WORD, stateRoot: WORD, transactionsRoot: WORD, sha3Uncles: WORD, size: "0x0", baseFeePerGas: "0x0", transactions: [], uncles: [],
});

function answer(method: string, params: unknown[]): unknown {
  if (method === "eth_chainId") return hex(SETTINGS.chainId);
  if (method === "eth_gasPrice") return hex(SETTINGS.gasPrice);
  if (method === "eth_blockNumber") return hex(BLOCK);
  if (method === "eth_getBalance") return hex(same(String(params[0]), STUB_WALLET) ? STUB_BALANCE : 0);
  if (method === "eth_getBlockByNumber") return blockAt(String(params[0]).startsWith("0x") ? Number(BigInt(String(params[0]))) : BLOCK);
  if (method === "eth_getLogs") return logs(params[0] as Parameters<typeof logs>[0]);
  if (method === "eth_call") {
    const { to, data } = params[0] as { to?: string; data?: Hex; input?: Hex };
    return call(String(to), (data ?? (params[0] as { input?: Hex }).input ?? "0x") as Hex);
  }
  throw new Error(`unexpected ${method}`);
}

interface Call {
  id: number;
  method: string;
  params: unknown[];
}

function reply({ id, method, params }: Call) {
  try {
    return { jsonrpc: "2.0", id, result: answer(method, params ?? []) };
  } catch (error) {
    return { jsonrpc: "2.0", id, error: { code: -32601, message: String(error) } };
  }
}

const server = createServer((request, response) => {
  const json = (body: unknown) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (request.method === "GET" && request.url === "/health") return json({ ok: true });
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    try {
      const calls = JSON.parse(body) as Call | Call[];
      json(Array.isArray(calls) ? calls.map(reply) : reply(calls));
    } catch {
      json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    }
  });
});

server.listen(MAINNET ? MAINNET_RPC_PORT : TESTNET_RPC_PORT, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
