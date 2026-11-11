import { decodeAbiParameters, toEventSelector } from "viem";
import { type Address, type Hex, lower, type RawLog } from "./types";

/**
 * What a Safe owner does, from its own logs. SafeL2 (what Safe{Wallet}
 * deploys on L2s, and the owner's stand-in in the fork rehearsal) logs each
 * transaction's call; a plain Safe only logs that one ran, and the call is
 * read from the transaction instead (`safe.ts`).
 */
export type SafeEvent =
  | { kind: "safeTx"; to: Address; value: bigint; data: Hex; operation: number }
  | { kind: "safeModuleTx"; module: Address; to: Address; value: bigint; data: Hex; operation: number }
  | { kind: "safeResult"; ok: boolean; viaModule: boolean }
  | { kind: "safeConfig"; change: SafeChange; subject: string };

export type SafeChange = "addedOwner" | "removedOwner" | "changedThreshold" | "enabledModule" | "disabledModule" | "changedGuard" | "changedModuleGuard" | "changedFallbackHandler";

const topic = (signature: string) => toEventSelector(signature);

const MULTISIG = topic("SafeMultiSigTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,bytes)");
const MODULE_TX = topic("SafeModuleTransaction(address,address,uint256,bytes,uint8)");
const RESULTS: Record<string, { ok: boolean; viaModule: boolean }> = {
  [topic("ExecutionSuccess(bytes32,uint256)")]: { ok: true, viaModule: false },
  [topic("ExecutionFailure(bytes32,uint256)")]: { ok: false, viaModule: false },
  [topic("ExecutionFromModuleSuccess(address)")]: { ok: true, viaModule: true },
  [topic("ExecutionFromModuleFailure(address)")]: { ok: false, viaModule: true },
};
const CHANGES: Record<string, SafeChange> = {
  [topic("AddedOwner(address)")]: "addedOwner",
  [topic("RemovedOwner(address)")]: "removedOwner",
  [topic("ChangedThreshold(uint256)")]: "changedThreshold",
  [topic("EnabledModule(address)")]: "enabledModule",
  [topic("DisabledModule(address)")]: "disabledModule",
  [topic("ChangedGuard(address)")]: "changedGuard",
  [topic("ChangedModuleGuard(address)")]: "changedModuleGuard",
  [topic("ChangedFallbackHandler(address)")]: "changedFallbackHandler",
};

const MULTISIG_TYPES = [
  { type: "address" }, { type: "uint256" }, { type: "bytes" }, { type: "uint8" }, { type: "uint256" }, { type: "uint256" },
  { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "bytes" }, { type: "bytes" },
] as const;
const MODULE_TYPES = [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes" }, { type: "uint8" }] as const;

/** An event's one argument: indexed in Safe v1.4 (a topic), not in v1.3 (the first data word). */
function soleArgument(log: RawLog): string {
  const word = log.topics[1] ?? (log.data.length >= 66 ? `0x${log.data.slice(2, 66)}` : null);
  return word ?? "0x";
}

const addressOf = (word: string) => lower(`0x${word.slice(-40)}`);

export function decodeSafeLog(log: RawLog): SafeEvent | null {
  const [topic0] = log.topics;
  if (topic0 === MULTISIG) {
    const [to, value, data, operation] = decodeAbiParameters(MULTISIG_TYPES, log.data as Hex);
    return { kind: "safeTx", to: lower(to), value, data, operation };
  }
  if (topic0 === MODULE_TX) {
    const [module, to, value, data, operation] = decodeAbiParameters(MODULE_TYPES, log.data as Hex);
    return { kind: "safeModuleTx", module: lower(module), to: lower(to), value, data, operation };
  }
  const result = RESULTS[topic0 ?? ""];
  if (result) return { kind: "safeResult", ...result };
  const change = CHANGES[topic0 ?? ""];
  if (!change) return null;
  const word = soleArgument(log);
  return { kind: "safeConfig", change, subject: change === "changedThreshold" ? BigInt(word).toString() : addressOf(word) };
}
