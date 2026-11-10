import { describe, expect, it, vi } from "vitest";
import { ensureEvmChain } from "@/shared/wallet/network";
import { createWalletStore } from "@/shared/wallet/store";
import { createStubDriver } from "@/shared/wallet/stub-driver";
import { WalletActionError } from "@/shared/wallet/types";

const ROBINHOOD = 4663;

/** A wallet on `start` that moves to `end` when asked, or throws `refusal`. */
function wallet(start: number | null, { end = ROBINHOOD as number | null, refusal = null as unknown } = {}) {
  let current = start;
  const switchTo = vi.fn(async () => {
    if (refusal) throw refusal;
    current = end;
  });
  return { access: { chainId: async () => current, switchTo }, switchTo };
}

describe("the wallet's network before a Robinhood Chain send", () => {
  it("leaves a wallet that's already on the chain alone", async () => {
    const { access, switchTo } = wallet(ROBINHOOD);
    await ensureEvmChain(access, ROBINHOOD);
    expect(switchTo).not.toHaveBeenCalled();
  });

  it("moves a wallet on another network, and checks it arrived", async () => {
    const { access, switchTo } = wallet(1);
    await ensureEvmChain(access, ROBINHOOD);
    expect(switchTo).toHaveBeenCalledOnce();
  });

  it("keeps a refusal to switch a refusal", async () => {
    const { access } = wallet(1, { refusal: Object.assign(new Error("User rejected the request."), { code: 4001 }) });
    await expect(ensureEvmChain(access, ROBINHOOD)).rejects.toMatchObject({ code: 4001 });
  });

  it.each([
    ["can't switch to the chain", wallet(1, { refusal: Object.assign(new Error("Unrecognized chain ID"), { code: 4902 }) })],
    ["says it switched but stayed put", wallet(1, { end: 1 })],
    ["won't say which chain it's on", wallet(null, { end: null })],
  ])("never sends from a wallet that %s", async (_, { access }) => {
    await expect(ensureEvmChain(access, ROBINHOOD)).rejects.toEqual(new WalletActionError("network"));
  });

  it("reaches the review as a network error, not a failure", async () => {
    const driver = createStubDriver();
    vi.spyOn(driver, "sendEvmTransaction").mockRejectedValueOnce(new WalletActionError("network"));
    const store = createWalletStore(async () => driver, () => null);
    await expect(store.sendEvmTransaction({ to: "0x1", data: "0x", value: "0", gas: null })).rejects.toMatchObject({ code: "network" });
  });
});
