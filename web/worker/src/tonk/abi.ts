import { getAbiItem, parseAbi, toEventSelector } from "viem";

/**
 * What the tonkfun.fun feed reads from the launchpad, its migrator, Uniswap's
 * PoolManager and the launch tokens, written from the mainnet build (frozen
 * at TonkpadRobinhood.sol 5c199225). `worker/tests/tonk-abi.test.ts` holds
 * every launchpad and migrator entry here to that build's ABI.
 */
export const FEED_EVENTS = parseAbi([
  "event MissionLaunched(address indexed token, address indexed creator, string name, string symbol, string metadataUri, uint16 crewFeeBps, uint16 creatorFeeBps, uint8 lockType, uint16 lockedBps, uint64 lockEnd, uint256 devBuyEth)",
  "event CurveTrade(address indexed token, address indexed trader, bool isBuy, uint256 grossEth, uint256 tokenAmount, uint256 protocolFee, uint256 crewFee, uint256 creatorFee, uint256 newVirtualEth, uint256 newVirtualTokens, uint256 remainingCurveTokens)",
  "event BundleTaxCollected(address indexed token, address indexed sniper, uint256 penaltyEth)",
  "event MissionGraduated(address indexed token, address indexed dexPoolOrPosition, uint256 ethLiquidity, uint256 tokenLiquidity, uint256 creatorGradBonus)",
  "event LockExtended(address indexed token, address indexed creator, uint64 newLockEnd)",
  "event DevTokensClaimed(address indexed token, address indexed creator, uint256 amount)",
  "event MetadataUpdated(address indexed token, string newMetadataUri, string newAgentPrompt)",
]);

export const MIGRATOR_FEED_EVENTS = parseAbi([
  "event PoolGraduatedAndLocked(address indexed token, uint256 indexed positionTokenId, uint256 ethSeeded, uint256 tokensSeeded, uint24 poolFee)",
]);

/** v4-core's Swap: `amount0` (ETH) and `amount1` (the token) are the swapper's own deltas, negative when paid in. */
export const POOL_EVENTS = parseAbi([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);

/** A launch token's ERC-20 Transfer (OpenZeppelin's, three topics). */
export const TOKEN_EVENTS = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** The views the feed reads: a mission's stored texts, its dev lock, and its pool's key and guard. */
export const FEED_VIEWS = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function missions(address token) view returns (address token, address creator, uint64 launchTimestamp, uint64 launchBlock, uint16 crewFeeBps, uint16 creatorFeeBps, bool graduated, uint256 virtualEthReserves, uint256 virtualTokenReserves, uint256 realEthReserves, uint256 realTokensLeftOnCurve, address dexPoolOrPosition, string metadataUri, string agentPrompt)",
  "function devLocks(address token) view returns (uint8 lockType, uint16 lockedBpsOfDevBuy, uint64 lockStart, uint64 lockEnd, uint256 totalLocked, uint256 claimedAmount)",
  "function devVestedCheckpoint(address token) view returns (uint256)",
  "function poolKey(address token, uint24 fee) view returns (PoolKey)",
  "function poolManager() view returns (address)",
  "function initializationGuard() view returns (address)",
  "function migrator() view returns (address)",
]);

const topic = (abi: Parameters<typeof getAbiItem>[0]["abi"], name: string) => toEventSelector(getAbiItem({ abi, name } as never) as never);

/** topic0 of each event the feed asks the chain for. */
export const TOPICS = {
  transfer: topic(TOKEN_EVENTS, "Transfer"),
  swap: topic(POOL_EVENTS, "Swap"),
} as const;
