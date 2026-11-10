import type { ChainId } from "@/shared/types/chain";
import { EMPTY_SNAPSHOT, type WalletDriver, type WalletSnapshot, type WalletState } from "./types";

/** Set while a wallet is connected, so the next visit restores it; nobody else loads the wallet code. */
export const REMEMBER_KEY = "tonkpad-wallet";

export interface WalletStore {
  getState(): WalletState;
  subscribe(listener: () => void): () => void;
  /** Loads the wallet code once. Resolves with the driver, or null when it can't load (the next call retries). */
  load(): Promise<WalletDriver | null>;
  /** Opens the wallet picker for a chain; false when the wallet code is unavailable or the picker failed. */
  connect(chain: ChainId): Promise<boolean>;
  switchChain(chain: ChainId): Promise<boolean>;
  disconnect(): Promise<void>;
  /** Brings back a remembered connection; does nothing for someone who never connected. */
  restore(): void;
  setTheme(theme: "dark" | "light"): void;
}

type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

const browserStorage: StorageAccess = () => (typeof window === "undefined" ? null : window.localStorage);

const connected = (snapshot: WalletSnapshot) => Object.keys(snapshot.accounts).length > 0;

/** The wallet state with its loader injected, so tests can run it on a fake driver. */
export function createWalletStore(loadDriver: () => Promise<WalletDriver>, storage: StorageAccess = browserStorage): WalletStore {
  let state: WalletState = { phase: "idle", snapshot: EMPTY_SNAPSHOT };
  let loading: Promise<WalletDriver | null> | null = null;
  let driver: WalletDriver | null = null;
  let theme: "dark" | "light" | null = null;
  const listeners = new Set<() => void>();

  const set = (next: WalletState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const remember = (on: boolean) => {
    try {
      if (on) storage()?.setItem(REMEMBER_KEY, "1");
      else storage()?.removeItem(REMEMBER_KEY);
    } catch {
      // Storage can be blocked (private mode); the connection still works for this page.
    }
  };

  const remembered = () => {
    try {
      return storage()?.getItem(REMEMBER_KEY) === "1";
    } catch {
      return false;
    }
  };

  // Once a connection settles, the flag mirrors it: kept while connected, dropped when not.
  const sync = (from: WalletDriver) => {
    const snapshot = from.snapshot();
    if (!snapshot.pending) remember(connected(snapshot));
    set({ phase: "ready", snapshot });
  };

  const load = () => {
    if (!loading) {
      set({ ...state, phase: "loading" });
      loading = loadDriver().then(
        (loaded) => {
          driver = loaded;
          if (theme) loaded.setTheme(theme);
          loaded.subscribe(() => sync(loaded));
          sync(loaded);
          return loaded;
        },
        () => {
          loading = null;
          set({ phase: "unavailable", snapshot: EMPTY_SNAPSHOT });
          return null;
        },
      );
    }
    return loading;
  };

  const run = async (action: (loaded: WalletDriver) => Promise<void>) => {
    const loaded = await load();
    if (!loaded) return false;
    try {
      await action(loaded);
      return true;
    } catch {
      return false;
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    connect: (chain) => run((loaded) => loaded.connect(chain)),
    switchChain: (chain) => run((loaded) => loaded.switchChain(chain)),
    async disconnect() {
      remember(false);
      await driver?.disconnect().catch(() => undefined);
    },
    restore() {
      if (state.phase === "idle" && remembered()) void load();
    },
    setTheme(next) {
      theme = next;
      driver?.setTheme(next);
    },
  };
}
