import { parseAbi } from "viem";

/**
 * The parts of TonkpadRobinhood the app uses, written from the repaired
 * build's ABI (out/TonkpadRobinhood.sol/TonkpadRobinhood.json); a test holds
 * the selectors and topics to that build. `LockType` is a uint8 on the wire.
 */
export const LAUNCHPAD_ABI = parseAbi([
  "struct LaunchParams { string name; string symbol; string metadataUri; string agentPrompt; uint16 crewFeeBps; uint16 creatorFeeBps; uint8 lockType; uint16 lockShareBps; uint64 lockDurationSeconds; }",
  "function launchMission(LaunchParams params) payable returns (address tokenAddr)",
  "function launchFee() view returns (uint256)",
  "function defaultVirtualEth() view returns (uint256)",
  "function defaultVirtualTokens() view returns (uint256)",
  "function paused() view returns (bool)",
  "function devLocks(address token) view returns (uint8 lockType, uint16 lockedBpsOfDevBuy, uint64 lockStart, uint64 lockEnd, uint256 totalLocked, uint256 claimedAmount)",
  "event MissionLaunched(address indexed token, address indexed creator, string name, string symbol, string metadataUri, uint16 crewFeeBps, uint16 creatorFeeBps, uint8 lockType, uint16 lockedBps, uint64 lockEnd, uint256 devBuyEth)",
  "event CurveTrade(address indexed token, address indexed trader, bool isBuy, uint256 grossEth, uint256 tokenAmount, uint256 protocolFee, uint256 crewFee, uint256 creatorFee, uint256 newVirtualEth, uint256 newVirtualTokens, uint256 remainingCurveTokens)",
  "error EnforcedPause()",
  // Phase 2: a mission's state, curve trades and the creator's tools.
  "function missions(address token) view returns (address token, address creator, uint64 launchTimestamp, uint64 launchBlock, uint16 crewFeeBps, uint16 creatorFeeBps, bool graduated, uint256 virtualEthReserves, uint256 virtualTokenReserves, uint256 realEthReserves, uint256 realTokensLeftOnCurve, address dexPoolOrPosition, string metadataUri, string agentPrompt)",
  "function devVestedCheckpoint(address token) view returns (uint256)",
  "function claimableDevTokens(address tokenAddr) view returns (uint256)",
  "function claimableEth(address account) view returns (uint256)",
  "function buy(address tokenAddr, uint256 minTokensOut, address referrer) payable returns (uint256 tokensOut)",
  "function sell(address tokenAddr, uint256 tokensIn, uint256 minEthOut, address referrer) returns (uint256 netEthOut)",
  "function claimDevTokens(address tokenAddr)",
  "function extendDevLock(address tokenAddr, uint64 additionalSeconds)",
  "function updateMissionMetadata(address tokenAddr, string newMetadataUri, string newAgentPrompt)",
  "function withdrawAccruedEth()",
  "event DevTokensClaimed(address indexed token, address indexed creator, uint256 amount)",
  "event LockExtended(address indexed token, address indexed creator, uint64 newLockEnd)",
  "event MetadataUpdated(address indexed token, string newMetadataUri, string newAgentPrompt)",
  "event MissionGraduated(address indexed token, address indexed dexPoolOrPosition, uint256 ethLiquidity, uint256 tokenLiquidity, uint256 creatorGradBonus)",
  "event FallbackEthWithdrawn(address indexed recipient, uint256 amount)",
  // The token's own refusals, which reach the app through a sell: listed here so they can be told apart.
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
]);

/** The parts of a mission's token (TonkToken) the app uses, held to the same build by the same test. */
export const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function eligibleSupply() view returns (uint256)",
  "function isExcludedFromCrew(address account) view returns (bool)",
  "function totalCrewRewardsPaid() view returns (uint256)",
  "function viewUnpaidRewards(address account) view returns (uint256)",
  "function sweepMyCrewRewards()",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event CrewRewardPaid(address indexed holder, uint256 ethAmount)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
]);

/** ArbSys: the L2 block number the contract itself reads for its launch-block shield. */
export const ARBSYS = "0x0000000000000000000000000000000000000064";
export const ARBSYS_ABI = parseAbi(["function arbBlockNumber() view returns (uint256)"]);
