// @vitest-environment node
import { encodeFunctionData, encodePacked, type Hex, parseAbi, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { LAUNCHPAD_EVENTS, MIGRATOR_EVENTS, OWNER_CALLS, SAFE_ABI } from "../src/alerts/abi";
import { decodeLogs } from "../src/alerts/events";
import { ownerEventAlerts } from "../src/alerts/owner";
import { safeAlerts } from "../src/alerts/safe";
import { integrityAlerts, settingsAlerts } from "../src/alerts/settings";
import { type Address, hexOf, type RawLog, type RawTx } from "../src/alerts/types";
import { built, ctx, ETH, HEAD, LAUNCHPAD, MIGRATOR, OWNER, POOL_MANAGER, RECORDED } from "./alerts-fixtures";

const SAFE: Address = "0x5afe00000000000000000000000000000000cafe";
const STRANGER: Address = "0x00000000000000000000000000000000000bad00";
const MULTISEND: Address = "0x40a2accbd92bca938b02010e17a5b8929b49130d";
const decode = (logs: RawLog[]) => decodeLogs(logs, LAUNCHPAD, MIGRATOR, new Set([SAFE]));

describe("owner events", () => {
  it("raises every owner event on either contract, each time it happens", () => {
    const logs = [
      built(LAUNCHPAD_EVENTS, "Paused", { account: SAFE }, { address: LAUNCHPAD, logIndex: 1 }),
      built(LAUNCHPAD_EVENTS, "Unpaused", { account: SAFE }, { address: LAUNCHPAD, logIndex: 2 }),
      built(LAUNCHPAD_EVENTS, "Paused", { account: SAFE }, { address: LAUNCHPAD, logIndex: 3 }),
      built(LAUNCHPAD_EVENTS, "OwnershipTransferStarted", { previousOwner: SAFE, newOwner: STRANGER }, { address: LAUNCHPAD, logIndex: 4 }),
      built(MIGRATOR_EVENTS, "OwnershipTransferred", { previousOwner: SAFE, newOwner: STRANGER }, { address: MIGRATOR, logIndex: 5 }),
      built(LAUNCHPAD_EVENTS, "GraduationMigratorSet", { migrator: MIGRATOR }, { address: LAUNCHPAD, logIndex: 6 }),
      built(LAUNCHPAD_EVENTS, "CrewExcluded", { token: STRANGER, account: POOL_MANAGER }, { address: LAUNCHPAD, logIndex: 7 }),
      built(MIGRATOR_EVENTS, "ProtocolTreasuryUpdated", { treasury: STRANGER }, { address: MIGRATOR, logIndex: 8 }),
    ];
    const alerts = ownerEventAlerts(decode(logs), ctx);
    expect(alerts.map((a) => [a.severity, a.title])).toEqual([
      ["warning", "Launchpad PAUSED"],
      ["warning", "Launchpad unpaused"],
      ["warning", "Launchpad PAUSED"],
      ["warning", "Ownership transfer started on the launchpad"],
      ["warning", "Ownership of the migrator changed"],
      ["warning", "Graduation migrator set"],
      ["warning", "Owner excluded an address from Crew rewards"],
      ["warning", "Migrator treasury changed"],
    ]);
    expect(new Set(alerts.map((a) => a.key)).size).toBe(8);
    expect(alerts[3].lines[0]).toBe(`0x5afe…cafe offered ownership to ${STRANGER}. It moves only when that address accepts. Block ${HEAD}.`);
  });

  it("words the recorded deployment's ownership as a deployment", () => {
    const alerts = ownerEventAlerts(decodeLogs(RECORDED.logs.logs, LAUNCHPAD, MIGRATOR, new Set()), ctx);
    expect(alerts.map((a) => [a.severity, a.title])).toEqual([
      ["info", "Ownership of the launchpad set at deployment"],
      ["info", "Ownership of the migrator set at deployment"],
    ]);
    expect(alerts[0].lines[0]).toMatch(new RegExp(`^Deployed by ${OWNER}\\. Block \\d+\\.$`));
  });

  it("ignores a look-alike owner event from any other contract", () => {
    expect(decode([built(LAUNCHPAD_EVENTS, "Paused", { account: SAFE }, { address: STRANGER })])).toEqual([]);
  });
});

describe("owner settings that log nothing", () => {
  const before = { "launchpad.launchFee": "100000000000000", "launchpad.protocolTreasury": OWNER, "launchpad.defaultVirtualEth": "1000000000000000000", "launchpad.defaultVirtualTokens": "1073000000000000000000000000" };

  it("raises each change with its old and new value, and nothing on the first read or when unchanged", () => {
    expect(settingsAlerts(null, before, 1, 2, ctx)).toEqual([]);
    expect(settingsAlerts(before, { ...before }, 1, 2, ctx)).toEqual([]);
    const after = { ...before, "launchpad.launchFee": "10000000000000000", "launchpad.protocolTreasury": STRANGER, "launchpad.defaultVirtualEth": "2000000000000000000" };
    const alerts = settingsAlerts(before, after, 101, 120, ctx);
    expect(alerts.map((a) => [a.key, a.title, a.lines[0]])).toEqual([
      ["setting:launchpad.launchFee:120", "Owner action: launch fee changed", "0.0001 ETH → 0.01 ETH, between blocks 101 and 120."],
      ["setting:launchpad.protocolTreasury:120", "Owner action: launchpad treasury changed", `${OWNER} → ${STRANGER}, between blocks 101 and 120.`],
      ["setting:launchpad.defaultVirtualEth:120", "Owner action: starting ETH reserve for new launches changed", "1 ETH → 2 ETH, between blocks 101 and 120."],
    ]);
  });

  it("holds mainnet's migrator to Uniswap's own PoolManager and PositionManager", () => {
    const linked = { "launchpad.graduationMigrator": MIGRATOR, "migrator.launchpad": LAUNCHPAD, "migrator.initializationGuard": "0x5855e0c9420895bb217ece668264f0d0cba16000", "migrator.poolManager": POOL_MANAGER, "migrator.positionManager": POOL_MANAGER };
    expect(integrityAlerts(linked, null, 46630, ctx).alerts).toEqual([]);
    expect(integrityAlerts(linked, null, 4663, ctx).alerts.map((a) => a.key)).toEqual(["integrity:uniswap"]);
    expect(integrityAlerts({ ...linked, "launchpad.graduationMigrator": STRANGER }, "0x5855e0c9420895bb217ece668264f0d0cba16000", 46630, ctx).alerts.map((a) => a.key)).toEqual(["integrity:migrator-link"]);
    expect(integrityAlerts(linked, "0x42d543c4586c68e198e067a77a2189c9abb72000", 46630, ctx).alerts.map((a) => a.key)).toEqual(["integrity:guard"]);
  });
});

/** A SafeL2 transaction: its SafeMultiSigTransaction log, then ExecutionSuccess (v1.4: txHash indexed) or ExecutionFailure. */
function safeTx(tx: string, call: { to: Address; data: Hex; operation?: number; value?: bigint }, ok = true): RawLog[] {
  const zero = "0x0000000000000000000000000000000000000000";
  const args = { to: call.to, value: call.value ?? BigInt(0), data: call.data, operation: call.operation ?? 0, safeTxGas: BigInt(0), baseGas: BigInt(0), gasPrice: BigInt(0), gasToken: zero, refundReceiver: zero, signatures: "0x", additionalInfo: "0x" };
  const result = { address: SAFE, topics: [toEventSelector(ok ? "ExecutionSuccess(bytes32,uint256)" : "ExecutionFailure(bytes32,uint256)"), `0x${"ab".repeat(32)}`], data: hexOf(0).padEnd(66, "0"), blockNumber: "0x10", transactionHash: tx, logIndex: "0x2" };
  return [built(SAFE_ABI, "SafeMultiSigTransaction", args, { address: SAFE, tx, logIndex: 1, block: 16 }), result];
}

const owner = (functionName: string, args: readonly unknown[] = []) => encodeFunctionData({ abi: OWNER_CALLS, functionName, args } as never) as Hex;

describe("an owner Safe's transactions", () => {
  it("names each owner call, including the setters that log nothing", () => {
    const alerts = safeAlerts(decode(safeTx("0x01", { to: LAUNCHPAD, data: owner("setLaunchFee", [ETH / BigInt(100)]) })), new Map(), ctx);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: "safe:0x01", severity: "warning", title: "Owner Safe acted on the contracts" });
    expect(alerts[0].lines.slice(0, 2)).toEqual(["0x5afe…cafe, block 16:", "• setLaunchFee(0.01 ETH) on the launchpad"]);
  });

  it("opens a MultiSend batch into its calls", () => {
    const pack = (to: Address, data: Hex) => encodePacked(["uint8", "address", "uint256", "uint256", "bytes"], [0, to, BigInt(0), BigInt((data.length - 2) / 2), data]);
    const batch = `0x${[pack(LAUNCHPAD, owner("pause")), pack(LAUNCHPAD, owner("setDefaultVirtualReserves", [ETH, BigInt("1073000000000000000000000000")])), pack(MIGRATOR, owner("transferOwnership", [STRANGER]))].map((p) => p.slice(2)).join("")}` as Hex;
    const multiSend = encodeFunctionData({ abi: parseAbi(["function multiSend(bytes transactions)"]), functionName: "multiSend", args: [batch] });
    const alerts = safeAlerts(decode(safeTx("0x02", { to: MULTISEND, data: multiSend, operation: 1 })), new Map(), ctx);
    expect(alerts[0].lines.slice(1, 4)).toEqual([
      "• pause() on the launchpad",
      "• setDefaultVirtualReserves(1 ETH, 1,073,000,000 tokens) on the launchpad",
      `• transferOwnership(${STRANGER}) on the migrator`,
    ]);
  });

  it("reads a plain Safe's call from its transaction, and flags a failed one", () => {
    const success: RawLog = { address: SAFE, topics: [toEventSelector("ExecutionSuccess(bytes32,uint256)")], data: `0x${"cd".repeat(32)}${"0".repeat(64)}`, blockNumber: "0x11", transactionHash: "0x03", logIndex: "0x0" };
    const exec = encodeFunctionData({ abi: SAFE_ABI, functionName: "execTransaction", args: [MIGRATOR, BigInt(0), owner("setProtocolTreasury", [STRANGER]), 0, BigInt(0), BigInt(0), BigInt(0), STRANGER, STRANGER, "0x"] });
    const tx: RawTx = { hash: "0x03", from: OWNER, to: SAFE, value: "0x0", input: exec };
    expect(safeAlerts(decode([success]), new Map([["0x03", tx]]), ctx)[0].lines[1]).toBe(`• setProtocolTreasury(${STRANGER}) on the migrator`);
    const failed = safeAlerts(decode(safeTx("0x04", { to: LAUNCHPAD, data: owner("unpause") }, false)), new Map(), ctx);
    expect(failed[0]).toMatchObject({ severity: "warning", title: "Owner Safe transaction FAILED" });
  });

  it("raises changes to the Safe itself, a module above all, whichever Safe version logged them", () => {
    const v14 = (signature: string, subject: string): RawLog => ({ address: SAFE, topics: [toEventSelector(signature), `0x${subject.slice(2).padStart(64, "0")}`], data: "0x", blockNumber: "0x12", transactionHash: "0x05", logIndex: "0x1" });
    const v13 = (signature: string, word: string): RawLog => ({ address: SAFE, topics: [toEventSelector(signature)], data: `0x${word.slice(2).padStart(64, "0")}`, blockNumber: "0x12", transactionHash: "0x05", logIndex: "0x2" });
    const alerts = safeAlerts(decode([v14("AddedOwner(address)", STRANGER), v13("ChangedThreshold(uint256)", "0x1"), { ...v14("EnabledModule(address)", STRANGER), logIndex: "0x3" }]), new Map(), ctx);
    expect(alerts.map((a) => [a.severity, a.title, a.lines[0]])).toEqual([
      ["warning", "Owner Safe 0x5afe…cafe added a signer", `New signer: ${STRANGER}. Whoever controls this Safe controls the contracts. Block 18.`],
      ["warning", "Owner Safe 0x5afe…cafe changed its threshold", "Signatures now needed: 1. Whoever controls this Safe controls the contracts. Block 18."],
      ["critical", "Owner Safe 0x5afe…cafe enabled a module", `A module can act without the signers: ${STRANGER}. Whoever controls this Safe controls the contracts. Block 18.`],
    ]);
  });

  it("ignores Safe events from an address that isn't an owner", () => {
    expect(decodeLogs(safeTx("0x06", { to: LAUNCHPAD, data: owner("pause") }), LAUNCHPAD, MIGRATOR, new Set())).toEqual([]);
  });
});
