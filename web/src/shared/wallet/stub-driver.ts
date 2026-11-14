import { privateKeyToAccount } from "viem/accounts";
import { isTestnetSite } from "@/shared/tonk/networks";
import type { ChainId } from "@/shared/types/chain";
import { evmSendParams } from "./fees";
import { type BridgeTransactionRequest, EMPTY_SNAPSHOT, type EvmTransactionRequest, WalletActionError, type WalletDriver, type WalletSnapshot } from "./types";

/**
 * The key the stub signs messages with, made for these tests alone: it is in
 * this file for anyone to read, was never funded, and never signs a
 * transaction. Its signatures are real, so the server's checks run for real.
 */
const STUB_EVM_KEY = "0x61964c0b625798aa5b4ea39159b579f8123e3b2f74fcff7475ef61fe9a5dac51";

/** The stub's fixed wallets: a valid Solana key that belongs to no one, and the test key's EVM address. */
export const STUB_ACCOUNTS: Record<ChainId, string> = {
  sol: "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv",
  rh: "0x3daa6db67596ce7633caa7ef42ca074a73db9490",
};

/** Set to "1" and the stub refuses every signature, as if the person rejected it; "network", as if the wallet couldn't switch networks. */
export const STUB_REJECT_KEY = "tonkpad-wallet-stub-reject";
/** The hash the stub returns for every Robinhood Chain transaction. */
export const STUB_EVM_HASH = `0x${"5a".repeat(32)}`;
/** Where the stub lists the bridge transactions it was asked to send, for the e2e tests to check. */
export const STUB_BRIDGE_SENT_KEY = "tonkpad-wallet-stub-bridge-sent";
/** Where the stub lists the eth_sendTransaction params it would have sent on Robinhood Chain, built as the real driver builds them. */
export const STUB_EVM_SENT_KEY = "tonkpad-wallet-stub-evm-sent";
/** The base fee the stub's pretend chain reports: 0.02 gwei, Robinhood Chain's floor. */
export const STUB_BASE_FEE = BigInt(20_000_000);

/** Records the params the real driver would send for this request, on this site's Robinhood Chain (no wallet, no network). */
async function noteEvmSend(request: EvmTransactionRequest) {
  const chainId = isTestnetSite() ? 46630 : 4663;
  const block = async () => ({ number: "0x1", baseFeePerGas: `0x${STUB_BASE_FEE.toString(16)}` });
  const params = await evmSendParams({ from: STUB_ACCOUNTS.rh, ...request }, chainId, block);
  try {
    const sent: unknown = JSON.parse(localStorage.getItem(STUB_EVM_SENT_KEY) ?? "[]");
    localStorage.setItem(STUB_EVM_SENT_KEY, JSON.stringify([...(Array.isArray(sent) ? sent : []), params]));
  } catch {
    // Nothing to keep.
  }
}

function noteBridgeSend(request: BridgeTransactionRequest) {
  try {
    const sent: unknown = JSON.parse(localStorage.getItem(STUB_BRIDGE_SENT_KEY) ?? "[]");
    localStorage.setItem(STUB_BRIDGE_SENT_KEY, JSON.stringify([...(Array.isArray(sent) ? sent : []), request]));
  } catch {
    // Nothing to keep.
  }
}

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
/** The name the stub's Robinhood Chain wallet announces, for tests of wallet-specific notes ("MetaMask"); none when unset. */
export const STUB_NAME_KEY = "tonkpad-wallet-stub-name";

const stubName = (accounts: Partial<Record<ChainId, string>>): string | null => {
  if (!accounts.rh) return null;
  try {
    return localStorage.getItem(STUB_NAME_KEY) || null;
  } catch {
    return null;
  }
};

const isChain = (value: unknown): value is ChainId => value === "sol" || value === "rh";

function read(): WalletSnapshot {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STUB_STORAGE_KEY) ?? "null");
    if (typeof saved === "object" && saved !== null && "active" in saved && "chains" in saved && Array.isArray(saved.chains)) {
      const chains = saved.chains.filter(isChain);
      const accounts = Object.fromEntries(chains.map((chain) => [chain, STUB_ACCOUNTS[chain]]));
      if (isChain(saved.active) && chains.includes(saved.active)) return { active: saved.active, accounts, pending: false, evmWallet: stubName(accounts) };
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
 * as it went in, and every EVM send returns the same fake hash. A message is
 * signed for real, with the test key.
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
    const accounts = { ...snapshot.accounts, [chain]: STUB_ACCOUNTS[chain] };
    set({ active: chain, accounts, pending: false, evmWallet: stubName(accounts) });
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
    sendEvmTransaction: async (request) => {
      const hash = await approve(STUB_EVM_HASH);
      await noteEvmSend(request);
      return hash;
    },
    sendBridgeTransaction: async (request) => {
      const hash = await approve(STUB_EVM_HASH);
      noteBridgeSend(request);
      return hash;
    },
    signEvmMessage: async (message) => approve(await privateKeyToAccount(STUB_EVM_KEY).signMessage({ message })),
  };
}
