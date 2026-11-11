import { parseAbi } from "viem";

/**
 * What the alerts read from tonkfun.fun's launchpad contracts, written from
 * the frozen mainnet build (forge out/, the internal audit freeze of 11 Nov
 * 2026). `worker/tests/alerts-abi.test.ts` holds every event and function
 * here to that build's ABI (`tests/fixtures/alerts/frozen-abi.json`).
 */

/** TonkpadRobinhood's events: curves, credits, graduation and every owner event. */
export const LAUNCHPAD_EVENTS = parseAbi([
  "event MissionLaunched(address indexed token, address indexed creator, string name, string symbol, string metadataUri, uint16 crewFeeBps, uint16 creatorFeeBps, uint8 lockType, uint16 lockedBps, uint64 lockEnd, uint256 devBuyEth)",
  "event CurveTrade(address indexed token, address indexed trader, bool isBuy, uint256 grossEth, uint256 tokenAmount, uint256 protocolFee, uint256 crewFee, uint256 creatorFee, uint256 newVirtualEth, uint256 newVirtualTokens, uint256 remainingCurveTokens)",
  "event BundleTaxCollected(address indexed token, address indexed sniper, uint256 penaltyEth)",
  "event MissionGraduated(address indexed token, address indexed dexPoolOrPosition, uint256 ethLiquidity, uint256 tokenLiquidity, uint256 creatorGradBonus)",
  "event FallbackEthCredited(address indexed recipient, uint256 amount)",
  "event FallbackEthWithdrawn(address indexed recipient, uint256 amount)",
  "event FallbackEthRedirected(address indexed claimant, address indexed recipient, uint256 amount)",
  "event GraduationMigratorSet(address indexed migrator)",
  "event CrewExcluded(address indexed token, address indexed account)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
]);

/** TonkpadUniV4Migrator's events. */
export const MIGRATOR_EVENTS = parseAbi([
  "event PoolGraduatedAndLocked(address indexed token, uint256 indexed positionTokenId, uint256 ethSeeded, uint256 tokensSeeded, uint24 poolFee)",
  "event MigrationRemainderHandled(address indexed token, uint256 ethToTreasury, uint256 tokensToDeadAddress)",
  "event PostGradRewardsDistributed(address indexed token, uint256 protocolEth, uint256 crewEth, uint256 creatorEth, uint256 tokensBurned)",
  "event FallbackEthCredited(address indexed recipient, uint256 amount)",
  "event FallbackEthWithdrawn(address indexed recipient, uint256 amount)",
  "event FallbackEthRedirected(address indexed claimant, address indexed recipient, uint256 amount)",
  "event ProtocolTreasuryUpdated(address indexed treasury)",
  "event CrewRewardRedirected(address indexed token, address indexed treasury, uint256 amount)",
  "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
]);

/** The launchpad's views and the one call a graduation dry run simulates. */
export const LAUNCHPAD_VIEWS = parseAbi([
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function paused() view returns (bool)",
  "function launchFee() view returns (uint256)",
  "function protocolTreasury() view returns (address)",
  "function defaultVirtualEth() view returns (uint256)",
  "function defaultVirtualTokens() view returns (uint256)",
  "function graduationMigrator() view returns (address)",
  "function claimableEth(address account) view returns (uint256)",
  "function pendingGraduationEth(address token) view returns (uint256)",
  "function getMissionTelemetry(address tokenAddr) view returns (uint256 priceInWeiPerToken, uint256 marketCapInWei, uint256 curveProgressBps, uint256 realEthInPool, uint256 totalCrewPaidWei, uint256 lockedTokensRemaining, uint64 lockEndTimestamp, bool isGraduated)",
  "function buy(address tokenAddr, uint256 minTokensOut, address referrer) payable returns (uint256 tokensOut)",
]);

/** The migrator's views. */
export const MIGRATOR_VIEWS = parseAbi([
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function protocolTreasury() view returns (address)",
  "function launchpad() view returns (address)",
  "function poolManager() view returns (address)",
  "function positionManager() view returns (address)",
  "function initializationGuard() view returns (address)",
  "function claimableEth(address account) view returns (uint256)",
  "function lockedPositions(address token) view returns (address token, address creator, uint256 positionTokenId, uint16 crewFeeBps, uint16 creatorFeeBps, uint24 uniV4PoolFee, uint256 totalEthFeesCollected, uint256 totalTokensBurned, bool initialized)",
]);

/** The pool guard (TonkPoolInitializationGuard): who it lets initialize pools, on which PoolManager. */
export const GUARD_VIEWS = parseAbi(["function migrator() view returns (address)", "function poolManager() view returns (address)"]);

/**
 * Every owner-only call on either contract (the frozen build's `onlyOwner`
 * functions, Ownable2Step's own, and the testnet release's three-argument
 * Crew exclusion), so an owner's transaction can be named.
 */
export const OWNER_CALLS = parseAbi([
  "function pause()",
  "function unpause()",
  "function setLaunchFee(uint256 newLaunchFee)",
  "function setGraduationMigrator(address migrator)",
  "function setTestnetVirtualReserves(uint256 virtualEth, uint256 virtualTokens)",
  "function setProtocolTreasury(address treasury)",
  "function setDefaultVirtualReserves(uint256 virtualEth, uint256 virtualTokens)",
  "function excludeAddressFromTokenCrew(address tokenAddr, address account)",
  "function excludeAddressFromTokenCrew(address tokenAddr, address account, bool excluded)",
  "function executePendingMigration(address tokenAddr)",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
  "function renounceOwnership()",
]);

/** Uniswap v4: the PoolManager's Initialize and the PositionManager's NFT transfer, as a graduation's receipt shows them. */
export const UNISWAP_EVENTS = parseAbi([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed id)",
]);

/**
 * A Safe that owns the contracts (Safe v1.3/v1.4, and SafeL2's detailed
 * events). Some of these are indexed in v1.4 and not in v1.3, so they are
 * matched by topic and read either way (`safe.ts`).
 */
export const SAFE_ABI = parseAbi([
  "event SafeMultiSigTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, bytes additionalInfo)",
  "event SafeModuleTransaction(address module, address to, uint256 value, bytes data, uint8 operation)",
  "event ExecutionSuccess(bytes32 txHash, uint256 payment)",
  "event ExecutionFailure(bytes32 txHash, uint256 payment)",
  "event ExecutionFromModuleSuccess(address module)",
  "event ExecutionFromModuleFailure(address module)",
  "event AddedOwner(address owner)",
  "event RemovedOwner(address owner)",
  "event ChangedThreshold(uint256 threshold)",
  "event EnabledModule(address module)",
  "event DisabledModule(address module)",
  "event ChangedGuard(address guard)",
  "event ChangedModuleGuard(address moduleGuard)",
  "event ChangedFallbackHandler(address handler)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
  "function multiSend(bytes transactions) payable",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
]);
