// @vitest-environment node
import { type Abi, type AbiEvent, type AbiFunction, toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { GUARD_VIEWS, LAUNCHPAD_EVENTS, LAUNCHPAD_VIEWS, MIGRATOR_EVENTS, MIGRATOR_VIEWS, OWNER_CALLS, SAFE_ABI, UNISWAP_EVENTS } from "../src/alerts/abi";
import { RECORDED } from "./alerts-fixtures";

/** An ABI item's shape as the chain sees it: name, input types and, for events, which are indexed. */
const shape = (item: AbiEvent | AbiFunction) =>
  `${item.type} ${item.name}(${item.inputs.map((input) => `${input.type}${"indexed" in input && input.indexed ? " indexed" : ""}`).join(",")})${item.type === "function" ? ` -> (${item.outputs.map((o) => o.type).join(",")})` : ""}`;
const shapes = (abi: Abi) => new Set(abi.filter((item): item is AbiEvent | AbiFunction => item.type === "event" || item.type === "function").map(shape));
const frozen = { launchpad: shapes(RECORDED.abi.launchpad), migrator: shapes(RECORDED.abi.migrator), guard: shapes(RECORDED.abi.guard) };
const ours = (abi: Abi) => abi.filter((item): item is AbiEvent | AbiFunction => item.type === "event" || item.type === "function");

describe("the alerts' ABI, held to the mainnet build (F-1 and F-2)", () => {
  it("reads every launchpad and migrator event and view exactly as the build declares it", () => {
    for (const item of ours(LAUNCHPAD_EVENTS).concat(ours(LAUNCHPAD_VIEWS))) expect(frozen.launchpad, shape(item)).toContain(shape(item));
    for (const item of ours(MIGRATOR_EVENTS).concat(ours(MIGRATOR_VIEWS))) expect(frozen.migrator, shape(item)).toContain(shape(item));
    for (const item of ours(GUARD_VIEWS)) expect(frozen.guard, shape(item)).toContain(shape(item));
  });

  it("reads every event the build emits except a creator's own edits", () => {
    const ignored = new Set(["MetadataUpdated", "LockExtended", "DevTokensClaimed"]);
    const read = (abi: Abi) => new Set(ours(abi).map((item) => item.name));
    const emitted = (abi: Abi) => abi.filter((item): item is AbiEvent => item.type === "event").map((item) => item.name);
    expect(emitted(RECORDED.abi.launchpad).filter((name) => !ignored.has(name) && !read(LAUNCHPAD_EVENTS).has(name))).toEqual([]);
    expect(emitted(RECORDED.abi.migrator).filter((name) => !read(MIGRATOR_EVENTS).has(name))).toEqual([]);
  });

  it("can name every onlyOwner function in the mainnet sources, and Ownable2Step's", () => {
    const named = new Set(ours(OWNER_CALLS).map((item) => item.name));
    expect(RECORDED.abi.ownerOnly.launchpad).toEqual([
      "excludeAddressFromTokenCrew", "executePendingMigration", "pause", "setDefaultVirtualReserves", "setGraduationMigrator", "setLaunchFee", "setProtocolTreasury", "setTestnetVirtualReserves", "unpause",
    ]);
    expect(RECORDED.abi.ownerOnly.migrator).toEqual(["setProtocolTreasury"]);
    for (const name of [...RECORDED.abi.ownerOnly.launchpad, ...RECORDED.abi.ownerOnly.migrator, "transferOwnership", "acceptOwnership", "renounceOwnership"]) expect(named).toContain(name);
    // Each owner call is the launchpad build's own (the migrator's three are a subset); the three-argument exclusion is the testnet release's.
    for (const item of ours(OWNER_CALLS).filter((call) => !(call.name === "excludeAddressFromTokenCrew" && call.inputs.length === 3))) {
      expect(frozen.launchpad, shape(item)).toContain(shape(item));
    }
  });

  it("matches Safe's and Uniswap's published event topics and selectors", () => {
    const topic = (abi: Abi, name: string) => toEventSelector(ours(abi).find((item) => item.name === name) as AbiEvent);
    expect(topic(SAFE_ABI, "SafeMultiSigTransaction")).toBe("0x66753cd2356569ee081232e3be8909b950e0a76c1f8460c3a5e3c2be32b11bed");
    expect(topic(SAFE_ABI, "ExecutionSuccess")).toBe("0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e");
    expect(topic(SAFE_ABI, "ExecutionFailure")).toBe("0x23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23");
    expect(topic(SAFE_ABI, "AddedOwner")).toBe("0x9465fa0c962cc76958e6373a993326400c1c94f8be2fe3a952adfa7f60b2ea26");
    expect(topic(SAFE_ABI, "RemovedOwner")).toBe("0xf8d49fc529812e9a7c5c50e69c20f0dccc0db8fa95c98bc58cc9a4f1c1299eaf");
    expect(topic(SAFE_ABI, "ChangedThreshold")).toBe("0x610f7ff2b304ae8903c3de74c60c6ab1f7d6226b3f52c5161905bb5ad4039c93");
    expect(topic(SAFE_ABI, "EnabledModule")).toBe("0xecdf3a3effea5783a3c4c2140e677577666428d44ed9d474a0b3a4c9943f8440");
    expect(toFunctionSelector(ours(SAFE_ABI).find((item) => item.name === "execTransaction") as AbiFunction)).toBe("0x6a761202");
    expect(toFunctionSelector(ours(SAFE_ABI).find((item) => item.name === "multiSend") as AbiFunction)).toBe("0x8d80ff0a");
    // The PoolManager's Initialize, as the recorded testnet graduation logged it.
    expect(topic(UNISWAP_EVENTS, "Initialize")).toBe(RECORDED.graduation.receipt.logs[8].topics[0]);
  });
});
