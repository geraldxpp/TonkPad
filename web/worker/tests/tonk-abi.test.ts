// @vitest-environment node
import { type Abi, type AbiEvent, type AbiFunction, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { POOL_MANAGER_ABI } from "@/shared/tonk/server/pool";
import { FEED_EVENTS, FEED_VIEWS, MIGRATOR_FEED_EVENTS, POOL_EVENTS, TOPICS } from "../src/tonk/abi";
import { RECORDED } from "./alerts-fixtures";

/** An ABI item's shape as the chain sees it: name, input types and, for events, which are indexed. */
const shape = (item: AbiEvent | AbiFunction) =>
  `${item.type} ${item.name}(${item.inputs.map((input) => `${input.type}${"indexed" in input && input.indexed ? " indexed" : ""}`).join(",")})${item.type === "function" ? ` -> (${item.outputs.map((o) => o.type).join(",")})` : ""}`;
const ours = (abi: Abi) => abi.filter((item): item is AbiEvent | AbiFunction => item.type === "event" || item.type === "function");
const shapes = (abi: Abi) => new Set(ours(abi).map(shape));
const frozen = { launchpad: shapes(RECORDED.abi.launchpad), migrator: shapes(RECORDED.abi.migrator), guard: shapes(RECORDED.abi.guard) };
const views = (names: string[]) => ours(FEED_VIEWS).filter((item) => names.includes(item.name));

describe("the tonkfun.fun feed's ABI, held to the mainnet build", () => {
  it("reads every launchpad and migrator event and view exactly as the build declares it", () => {
    for (const item of ours(FEED_EVENTS).concat(views(["missions", "devLocks", "devVestedCheckpoint"]))) expect(frozen.launchpad, shape(item)).toContain(shape(item));
    for (const item of ours(MIGRATOR_FEED_EVENTS).concat(views(["poolKey", "poolManager", "initializationGuard"]))) expect(frozen.migrator, shape(item)).toContain(shape(item));
    for (const item of views(["migrator", "poolManager"])) expect(frozen.guard, shape(item)).toContain(shape(item));
  });

  it("asks for the PoolManager's Swap as the app matches a pool trade's receipt, and the ERC-20 Transfer", () => {
    expect(TOPICS.swap).toBe(toEventSelector(POOL_MANAGER_ABI[0]));
    expect(shape(ours(POOL_EVENTS)[0])).toBe(shape(POOL_MANAGER_ABI[0]));
    expect(TOPICS.transfer).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });
});
