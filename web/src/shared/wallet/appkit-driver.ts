import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { robinhood, robinhoodTestnet, solana } from "@reown/appkit/networks";
import { isTestnetSite } from "@/shared/tonk/networks";
import type { ChainId } from "@/shared/types/chain";
import { type AppKitView, NAMESPACES, sameSnapshot, toSnapshot } from "./appkit-state";
import { BRIDGE_SOURCES } from "./bridge-sources";
import { ensureEvmChain } from "./network";
import { WalletActionError, type WalletDriver } from "./types";

/**
 * Robinhood Chain is viem's `robinhood` (chain id 4663, its public RPC and
 * Blockscout). On the testnet site it is `robinhoodTestnet` (46630) instead,
 * and Solana isn't offered: everything the wallet signs there is on testnet.
 */
const TESTNET = isTestnetSite();
const EVM = TESTNET ? robinhoodTestnet : robinhood;
const NETWORKS = { sol: solana, rh: EVM } as const;
const EVM_NETWORKS = TESTNET ? ([EVM] as const) : ([EVM, ...BRIDGE_SOURCES] as const);

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

/** The chain an EVM wallet is on, from the wallet itself ("0x1237" from extensions, 4663 over WalletConnect). */
async function walletChainId(provider: Eip1193): Promise<number | null> {
  try {
    const id = Number(await provider.request({ method: "eth_chainId" }));
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

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
    adapters: TESTNET ? [new WagmiAdapter({ projectId, networks: [EVM] })] : [new SolanaAdapter(), new WagmiAdapter({ projectId, networks: [...EVM_NETWORKS] })],
    networks: TESTNET ? [EVM] : [solana, ...EVM_NETWORKS],
    defaultNetwork: TESTNET ? EVM : solana,
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
    // AppKit's own "Switch Network" screen can't be closed, and a multi-chain
    // wallet's other side (Ethereum, say) can set it off even mid-way through
    // a Solana swap. The app moves the wallet to the right network itself,
    // right before each signature, so that screen never shows.
    allowUnsupportedChain: true,
  });

  const read = () => {
    const state = appKit.getState();
    const view: AppKitView = {
      initialized: state.initialized,
      open: state.open,
      activeNamespace: appKit.getActiveChainNamespace(),
      accounts: { solana: TESTNET ? undefined : appKit.getAccount(NAMESPACES.sol), eip155: appKit.getAccount(NAMESPACES.rh) },
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
  if (!TESTNET) appKit.subscribeAccount(refresh, NAMESPACES.sol);
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

  /**
   * Points AppKit, and the wallet, at the chain, throwing if the wallet won't
   * go. AppKit only asks the wallet once the chain's namespace is the active
   * one, so that comes first.
   */
  const moveTo = async (chain: ChainId) => {
    if (appKit.getActiveChainNamespace() !== NAMESPACES[chain]) await appKit.switchNetwork(NETWORKS[chain], { throwOnFailure: true });
    await appKit.switchNetwork(NETWORKS[chain], { throwOnFailure: true });
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
      // A change on the wallet's EVM side can leave AppKit's Solana network unknown, and the signer refuses to sign on one.
      if (appKit.getCaipNetwork(NAMESPACES.sol)?.id !== NETWORKS.sol.id) await moveTo("sol");
      // Loaded with the wallet code, never in the page bundle.
      const { VersionedTransaction } = await import("@solana/web3.js");
      const signed = await signer.signTransaction(VersionedTransaction.deserialize(fromBase64(transaction)));
      return toBase64(signed.serialize());
    },
    async sendEvmTransaction({ to, data, value, gas }) {
      const provider = appKit.getProvider<Eip1193>(NAMESPACES.rh);
      const from = appKit.getAccount(NAMESPACES.rh)?.address;
      if (!provider || !from) throw new WalletActionError("failed");
      // The wallet's own answer decides: AppKit's record can be stale, and its switch fails silently by default.
      await ensureEvmChain({ chainId: () => walletChainId(provider), switchTo: () => moveTo("rh") }, NETWORKS.rh.id);
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to, data, value: hex(value), ...(gas ? { gas: hex(gas) } : {}) }],
      });
      if (typeof hash !== "string") throw new WalletActionError("failed");
      return hash;
    },
    async sendBridgeTransaction({ chainId, to, data, value, gas }) {
      const network = EVM_NETWORKS.find((item) => item.id === chainId);
      const provider = appKit.getProvider<Eip1193>(NAMESPACES.rh);
      const from = appKit.getAccount(NAMESPACES.rh)?.address;
      if (!network || !provider || !from) throw new WalletActionError("failed");
      // The same guard as a swap, on the transfer's own network: it can only go out where it was built for.
      await ensureEvmChain(
        {
          chainId: () => walletChainId(provider),
          switchTo: async () => {
            if (appKit.getActiveChainNamespace() !== NAMESPACES.rh) await appKit.switchNetwork(network, { throwOnFailure: true });
            await appKit.switchNetwork(network, { throwOnFailure: true });
          },
        },
        chainId,
      );
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to, data, value: hex(value), ...(gas ? { gas: hex(gas) } : {}) }],
      });
      if (typeof hash !== "string") throw new WalletActionError("failed");
      return hash;
    },
  };
}
