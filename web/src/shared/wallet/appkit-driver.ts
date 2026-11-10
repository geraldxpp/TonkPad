import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { robinhood, solana } from "@reown/appkit/networks";
import type { ChainId } from "@/shared/types/chain";
import { type AppKitView, NAMESPACES, sameSnapshot, toSnapshot } from "./appkit-state";
import { WalletActionError, type WalletDriver } from "./types";

/** Robinhood Chain is viem's `robinhood` (chain id 4663, its public RPC and Blockscout). */
const NETWORKS = { sol: solana, rh: robinhood } as const;

/** How long a first Connect waits for AppKit to set up before opening the picker anyway. */
const READY_WAIT_MS = 4_000;

/** The picker in the page's theme: the CTA blue as its accent and the app's UI font. Read from the tokens, never hard-coded. */
function themeVariables() {
  const cta = getComputedStyle(document.documentElement).getPropertyValue("--cta").trim();
  return {
    "--w3m-accent": cta,
    "--w3m-font-family": getComputedStyle(document.body).fontFamily,
    // Above the sticky top bar (z-30) and the phone tab bar (z-40).
    "--w3m-z-index": 1000,
  };
}

/** The two provider shapes the swap uses: a Solana signer and an EIP-1193 provider. */
interface SolanaSigner {
  signTransaction<T>(transaction: T): Promise<T>;
}
interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const hex = (wei: string) => `0x${BigInt(wei).toString(16)}`;

const pageTheme = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

/**
 * Reown AppKit, loaded only when the wallet is first needed. Its picker only
 * connects wallets here: email and social sign-in, Reown Authentication,
 * swaps, on-ramp, send and activity are off (the Reown dashboard must keep
 * them off too, since its settings can override these). The Coinbase and Base
 * SDK connectors are off as well; those wallets still connect as browser
 * extensions or through WalletConnect. It signs only the swaps the app
 * builds, and only once the person approves them in their wallet.
 */
export async function createAppKitDriver(projectId: string): Promise<WalletDriver> {
  const origin = window.location.origin;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || "tonkfun.fun";
  const appKit = createAppKit({
    projectId,
    adapters: [new SolanaAdapter(), new WagmiAdapter({ projectId, networks: [robinhood] })],
    networks: [solana, robinhood],
    defaultNetwork: solana,
    metadata: { name: "tonkfun.fun", description, url: origin, icons: [`${origin}/icon.png`] },
    themeMode: pageTheme(),
    themeVariables: themeVariables(),
    features: {
      analytics: false,
      email: false,
      socials: false,
      reownAuthentication: false,
      swaps: false,
      onramp: false,
      send: false,
      receive: false,
      history: false,
    },
    enableCoinbase: false,
    enableBaseAccount: false,
  });

  const read = () => {
    const state = appKit.getState();
    const view: AppKitView = {
      initialized: state.initialized,
      open: state.open,
      activeNamespace: appKit.getActiveChainNamespace(),
      accounts: { solana: appKit.getAccount(NAMESPACES.sol), eip155: appKit.getAccount(NAMESPACES.rh) },
    };
    return toSnapshot(view);
  };

  let snapshot = read();
  const listeners = new Set<() => void>();
  const refresh = () => {
    const next = read();
    if (sameSnapshot(next, snapshot)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  appKit.subscribeAccount(refresh, NAMESPACES.sol);
  appKit.subscribeAccount(refresh, NAMESPACES.rh);
  appKit.subscribeState(refresh);
  appKit.subscribeNetwork(refresh);

  // Wait for setup (and a saved session coming back), but never leave Connect spinning on a slow network.
  await Promise.race([appKit.ready().then(refresh), new Promise((resolve) => setTimeout(resolve, READY_WAIT_MS))]);

  /**
   * The picker, listing only the chain's wallets. The chain is made active
   * first: with no wallet on it yet that's just a setting, and it keeps the
   * picker from detouring through its network-switch screen.
   */
  const pick = async (chain: ChainId) => {
    if (appKit.getActiveChainNamespace() !== NAMESPACES[chain]) await appKit.switchNetwork(NETWORKS[chain]);
    await appKit.open({ view: "Connect", namespace: NAMESPACES[chain] });
  };

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect: pick,
    async switchChain(chain) {
      if (!snapshot.accounts[chain]) return pick(chain);
      await appKit.switchNetwork(NETWORKS[chain]);
      refresh();
    },
    disconnect: () => appKit.disconnect(),
    setTheme(theme) {
      appKit.setThemeMode(theme);
      appKit.setThemeVariables(themeVariables());
    },
    async signSolanaTransaction(transaction) {
      const signer = appKit.getProvider<SolanaSigner>(NAMESPACES.sol);
      if (!signer) throw new WalletActionError("failed");
      // Loaded with the wallet code, never in the page bundle.
      const { VersionedTransaction } = await import("@solana/web3.js");
      const signed = await signer.signTransaction(VersionedTransaction.deserialize(fromBase64(transaction)));
      return toBase64(signed.serialize());
    },
    async sendEvmTransaction({ to, data, value, gas }) {
      const provider = appKit.getProvider<Eip1193>(NAMESPACES.rh);
      const from = appKit.getAccount(NAMESPACES.rh)?.address;
      if (!provider || !from) throw new WalletActionError("failed");
      if (appKit.getCaipNetwork(NAMESPACES.rh)?.id !== NETWORKS.rh.id) await appKit.switchNetwork(NETWORKS.rh);
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to, data, value: hex(value), ...(gas ? { gas: hex(gas) } : {}) }],
      });
      if (typeof hash !== "string") throw new WalletActionError("failed");
      return hash;
    },
  };
}
