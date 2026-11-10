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
]);
