import type { ChainId } from "@/shared/types/chain";
import { EMPTY_SNAPSHOT, WalletActionError, type WalletDriver, type WalletSnapshot } from "./types";

/** The stub's fixed wallets (a valid Solana key and EVM address that belong to no one). */
export const STUB_ACCOUNTS: Record<ChainId, string> = {
  sol: "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv",
  rh: "0x7a5e00000000000000000000000000000000c0de",
};

/** Set to "1" and the stub refuses every signature, as if the person rejected it; "network", as if the wallet couldn't switch networks. */
export const STUB_REJECT_KEY = "tonkpad-wallet-stub-reject";
/** The hash the stub returns for every Robinhood Chain transaction. */
export const STUB_EVM_HASH = `0x${"5a".repeat(32)}`;

const told = () => {
  try {
    return localStorage.getItem(STUB_REJECT_KEY);
  } catch {
    return null;
  }
};

/** Signs nothing for real: waits like a wallet, then approves (or rejects when told to). */
const approve = async <T>(result: T): Promise<T> => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const refusal = told();
  if (refusal === "1") throw new WalletActionError("rejected");
  if (refusal === "network") throw new WalletActionError("network");
  return result;
};

/** Where the stub keeps its session: `{ "active": "sol", "chains": ["sol", "rh"] }`. */
export const STUB_STORAGE_KEY = "tonkpad-wallet-stub";

const isChain = (value: unknown): value is ChainId => value === "sol" || value === "rh";

function read(): WalletSnapshot {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STUB_STORAGE_KEY) ?? "null");
    if (typeof saved === "object" && saved !== null && "active" in saved && "chains" in saved && Array.isArray(saved.chains)) {
      const chains = saved.chains.filter(isChain);
      const accounts = Object.fromEntries(chains.map((chain) => [chain, STUB_ACCOUNTS[chain]]));
      if (isChain(saved.active) && chains.includes(saved.active)) return { active: saved.active, accounts, pending: false };
    }
  } catch {
    // Unreadable or blocked storage: start disconnected.
  }
  return EMPTY_SNAPSHOT;
}

function save({ active, accounts }: WalletSnapshot) {
  try {
    if (active) localStorage.setItem(STUB_STORAGE_KEY, JSON.stringify({ active, chains: Object.keys(accounts) }));
    else localStorage.removeItem(STUB_STORAGE_KEY);
  } catch {
    // Nothing to keep.
  }
}

/**
 * A pretend wallet for the e2e builds (NEXT_PUBLIC_WALLET_STUB=1), so tests
 * never need a real wallet or the Reown network. Like the real driver, a
 * second chain joins the first instead of replacing it; it connects after a
 * short wait that shows the pending state, and keeps its session across
 * reloads. Its "signatures" change nothing: a Solana transaction comes back
 * as it went in, and every EVM send returns the same fake hash.
 */
export function createStubDriver(): WalletDriver {
  let snapshot = read();
  const listeners = new Set<() => void>();
  const set = (next: WalletSnapshot) => {
    snapshot = next;
    if (!next.pending) save(next);
    for (const listener of listeners) listener();
  };
  const connect = async (chain: ChainId) => {
    set({ ...snapshot, pending: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    set({ active: chain, accounts: { ...snapshot.accounts, [chain]: STUB_ACCOUNTS[chain] }, pending: false });
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect,
    switchChain: (chain) => (snapshot.accounts[chain] ? Promise.resolve(set({ ...snapshot, active: chain })) : connect(chain)),
    disconnect: async () => set(EMPTY_SNAPSHOT),
    setTheme: () => undefined,
    signSolanaTransaction: (transaction) => approve(transaction),
    sendEvmTransaction: () => approve(STUB_EVM_HASH),
  };
}
