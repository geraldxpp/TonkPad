import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChainId } from "@/shared/types/chain";
import { createWalletStore, REMEMBER_KEY } from "@/shared/wallet/store";
import { createStubDriver, STUB_ACCOUNTS } from "@/shared/wallet/stub-driver";
import { EMPTY_SNAPSHOT, type WalletDriver, type WalletSnapshot } from "@/shared/wallet/types";

/** A driver whose state the test sets by hand. */
function fakeDriver(initial: WalletSnapshot = EMPTY_SNAPSHOT) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const emit = (next: WalletSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const driver: WalletDriver = {
    snapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect: vi.fn(async (chain: ChainId) => emit({ active: chain, accounts: { [chain]: STUB_ACCOUNTS[chain] }, pending: false })),
    switchChain: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => emit(EMPTY_SNAPSHOT)),
    setTheme: vi.fn(),
    signSolanaTransaction: vi.fn(async (transaction: string) => `signed:${transaction}`),
    sendEvmTransaction: vi.fn(async () => "0xhash"),
    sendBridgeTransaction: vi.fn(async () => "0xhash"),
  };
  return { driver, emit };
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("wallet store", () => {
  it("stays idle, with nothing loaded, until the wallet is first needed", async () => {
    const { driver } = fakeDriver();
    const load = vi.fn(async () => driver);
    const store = createWalletStore(load, memoryStorage);
    store.restore();
    expect(load).not.toHaveBeenCalled();
    expect(store.getState().phase).toBe("idle");

    const connecting = store.connect("sol");
    expect(store.getState().phase).toBe("loading");
    await expect(connecting).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(driver.connect).toHaveBeenCalledWith("sol");
    expect(store.getState()).toEqual({ phase: "ready", snapshot: { active: "sol", accounts: { sol: STUB_ACCOUNTS.sol }, pending: false } });
  });

  it("remembers a settled connection, forgets it on disconnect and restores it next time", async () => {
    const storage = memoryStorage();
    const { driver, emit } = fakeDriver();
    const store = createWalletStore(async () => driver, () => storage);
    await store.connect("rh");
    expect(storage.getItem(REMEMBER_KEY)).toBe("1");

    // A pending update (a picker open, a session coming back) doesn't change the flag.
    emit({ ...EMPTY_SNAPSHOT, pending: true });
    expect(storage.getItem(REMEMBER_KEY)).toBe("1");
    emit({ active: "rh", accounts: { rh: STUB_ACCOUNTS.rh }, pending: false });

    const next = fakeDriver();
    const load = vi.fn(async () => next.driver);
    const later = createWalletStore(load, () => storage);
    later.restore();
    expect(load).toHaveBeenCalledTimes(1);

    await store.disconnect();
    expect(driver.disconnect).toHaveBeenCalled();
    expect(storage.getItem(REMEMBER_KEY)).toBeNull();
  });

  it("forgets a remembered session that didn't come back", async () => {
    const storage = memoryStorage();
    storage.setItem(REMEMBER_KEY, "1");
    const { driver, emit } = fakeDriver({ ...EMPTY_SNAPSHOT, pending: true });
    const store = createWalletStore(async () => driver, () => storage);
    store.restore();
    await store.load();
    expect(storage.getItem(REMEMBER_KEY)).toBe("1");
    emit(EMPTY_SNAPSHOT);
    expect(storage.getItem(REMEMBER_KEY)).toBeNull();
  });

  it("reports unavailable when the wallet code can't load, and retries on the next try", async () => {
    const { driver } = fakeDriver();
    const load = vi.fn<() => Promise<WalletDriver>>().mockRejectedValueOnce(new Error("no project id")).mockResolvedValueOnce(driver);
    const store = createWalletStore(load, memoryStorage);
    await expect(store.connect("sol")).resolves.toBe(false);
    expect(store.getState().phase).toBe("unavailable");
    await expect(store.connect("sol")).resolves.toBe(true);
    expect(store.getState().phase).toBe("ready");
  });

  it("passes the page theme to the wallet picker, before and after it loads", async () => {
    const { driver } = fakeDriver();
    const store = createWalletStore(async () => driver, memoryStorage);
    store.setTheme("light");
    await store.load();
    expect(driver.setTheme).toHaveBeenCalledWith("light");
    store.setTheme("dark");
    expect(driver.setTheme).toHaveBeenLastCalledWith("dark");
  });

  it("tells subscribers about every change", async () => {
    const { driver } = fakeDriver();
    const store = createWalletStore(async () => driver, memoryStorage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.connect("sol");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await store.disconnect();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("stub driver", () => {
  it("adds a second chain, switches between them and keeps its session across reloads", async () => {
    const stub = createStubDriver();
    await stub.connect("sol");
    expect(stub.snapshot()).toEqual({ active: "sol", accounts: { sol: STUB_ACCOUNTS.sol }, pending: false });
    expect(createStubDriver().snapshot().active).toBe("sol");

    // A chain without a connection gets one; the first stays connected.
    await stub.switchChain("rh");
    const both = { sol: STUB_ACCOUNTS.sol, rh: STUB_ACCOUNTS.rh };
    expect(stub.snapshot()).toEqual({ active: "rh", accounts: both, pending: false });
    await stub.switchChain("sol");
    expect(stub.snapshot()).toEqual({ active: "sol", accounts: both, pending: false });
    expect(createStubDriver().snapshot()).toEqual({ active: "sol", accounts: both, pending: false });

    await stub.disconnect();
    expect(stub.snapshot()).toEqual(EMPTY_SNAPSHOT);
    expect(createStubDriver().snapshot()).toEqual(EMPTY_SNAPSHOT);
  });
});

describe("signing", () => {
  it("passes a signature through, and turns a wallet's refusal into a rejection", async () => {
    const { driver } = fakeDriver();
    const store = createWalletStore(async () => driver, memoryStorage);
    await expect(store.signSolanaTransaction("AAAA")).resolves.toBe("signed:AAAA");
    vi.mocked(driver.sendEvmTransaction).mockRejectedValueOnce(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    await expect(store.sendEvmTransaction({ to: "0x1", data: "0x", value: "0", gas: null })).rejects.toMatchObject({ code: "rejected" });
    vi.mocked(driver.signSolanaTransaction).mockRejectedValueOnce(new Error("Wallet disconnected"));
    await expect(store.signSolanaTransaction("AAAA")).rejects.toMatchObject({ code: "failed" });
  });

  it("fails cleanly when the wallet code can't load", async () => {
    const store = createWalletStore(() => Promise.reject(new Error("no project id")), memoryStorage);
    await expect(store.signSolanaTransaction("AAAA")).rejects.toMatchObject({ code: "failed" });
  });

  it("the stub approves, or rejects when told to", async () => {
    const stub = createStubDriver();
    await expect(stub.signSolanaTransaction("AAAA")).resolves.toBe("AAAA");
    localStorage.setItem("tonkpad-wallet-stub-reject", "1");
    await expect(stub.sendEvmTransaction({ to: "0x1", data: "0x", value: "0", gas: null })).rejects.toMatchObject({ code: "rejected" });
  });
});
