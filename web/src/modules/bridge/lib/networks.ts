import { isEvmAddress, isSolanaAddress } from "@/shared/lib/address";

export type NetworkVm = "evm" | "svm";
/** What an asset is worth in kind: a dollar stays a dollar, and ETH stays ETH. */
export type AssetFamily = "eth" | "usd" | "coin";

export interface BridgeAsset {
  /** Its address on the network; the chain's own coin is NATIVE_EVM or NATIVE_SVM. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  art: string;
  family: AssetFamily;
  native: boolean;
}

export interface BridgeNetwork {
  /** In the URL and the routes: "base", "rh". */
  id: string;
  name: string;
  /** The EVM chain id; for Solana, the id the bridges use for it. */
  chainId: number;
  vm: NetworkVm;
  logo: string;
  /** Where a transaction can be looked up. */
  explorer: string;
  /** What Max leaves behind in the chain's coin, for network fees (base units). */
  feeReserve: string;
  assets: readonly BridgeAsset[];
}

export const NATIVE_EVM = "0x0000000000000000000000000000000000000000";
export const NATIVE_SVM = "11111111111111111111111111111111";
const RELAY_ICON = (chainId: number) => `https://assets.relay.link/icons/${chainId}/light.png`;
const USDT_ART = "https://coin-images.coingecko.com/coins/images/39963/large/usdt.png";

const eth = (): BridgeAsset => ({ address: NATIVE_EVM, symbol: "ETH", name: "Ether", decimals: 18, art: "/coins/eth.svg", family: "eth", native: true });
const coin = (symbol: string, name: string, art: string): BridgeAsset => ({ address: NATIVE_EVM, symbol, name, decimals: 18, art, family: "coin", native: true });
const usdc = (address: string, decimals = 6): BridgeAsset => ({ address, symbol: "USDC", name: "USD Coin", decimals, art: "/coins/usdc.svg", family: "usd", native: false });
const usdt = (address: string, decimals = 6): BridgeAsset => ({ address, symbol: "USDT", name: "Tether USD", decimals, art: USDT_ART, family: "usd", native: false });
const usdg = (address: string): BridgeAsset => ({ address, symbol: "USDG", name: "Global Dollar", decimals: 6, art: "/coins/usdg.svg", family: "usd", native: false });

/** Small on the cheap networks, more where a transaction costs more. */
const RESERVE = { l2: "300000000000000", l1: "3000000000000000", coin: "50000000000000000", sol: "15000000" };

/**
 * Every network and asset the bridge offers. Addresses are fixed here, never
 * taken from a request or a provider: anyone can name a token USDC. Each was
 * checked against Relay's and Across's own lists.
 */
export const BRIDGE_NETWORKS: readonly BridgeNetwork[] = [
  { id: "base", name: "Base", chainId: 8453, vm: "evm", logo: "/chains/base.svg", explorer: "https://basescan.org", feeReserve: RESERVE.l2, assets: [eth(), usdc("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"), usdt("0xfde4c96c8593536e31f229ea8f37b2ada2699bb2")] },
  { id: "eth", name: "Ethereum", chainId: 1, vm: "evm", logo: "/chains/eth.svg", explorer: "https://etherscan.io", feeReserve: RESERVE.l1, assets: [eth(), usdc("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), usdt("0xdac17f958d2ee523a2206206994597c13d831ec7"), usdg("0xe343167631d89b6ffc58b88d6b7fb0228795491d")] },
  { id: "arb", name: "Arbitrum", chainId: 42161, vm: "evm", logo: "/chains/arb.svg", explorer: "https://arbiscan.io", feeReserve: RESERVE.l2, assets: [eth(), usdc("0xaf88d065e77c8cc2239327c5edb3a432268e5831"), usdt("0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9")] },
  { id: "rh", name: "Robinhood Chain", chainId: 4663, vm: "evm", logo: "/chains/rh.png", explorer: "https://robinhoodchain.blockscout.com", feeReserve: RESERVE.l2, assets: [eth(), usdg("0x5fc5360d0400a0fd4f2af552add042d716f1d168")] },
  {
    id: "sol",
    name: "Solana",
    chainId: 792703809,
    vm: "svm",
    logo: "/chains/sol.png",
    explorer: "https://solscan.io",
    feeReserve: RESERVE.sol,
    assets: [
      { address: NATIVE_SVM, symbol: "SOL", name: "Solana", decimals: 9, art: "/chains/sol.png", family: "coin", native: true },
      usdc("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      usdt("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
      usdg("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"),
    ],
  },
  { id: "op", name: "Optimism", chainId: 10, vm: "evm", logo: RELAY_ICON(10), explorer: "https://optimistic.etherscan.io", feeReserve: RESERVE.l2, assets: [eth(), usdc("0x0b2c639c533813f4aa9d7837caf62653d097ff85"), usdt("0x94b008aa00579c1307b0ef2c499ad98a8ce58e58")] },
  { id: "polygon", name: "Polygon", chainId: 137, vm: "evm", logo: RELAY_ICON(137), explorer: "https://polygonscan.com", feeReserve: RESERVE.coin, assets: [coin("POL", "Polygon", RELAY_ICON(137)), usdc("0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"), usdt("0xc2132d05d31c914a87c6611c10748aeb04b58e8f")] },
  { id: "bnb", name: "BNB Chain", chainId: 56, vm: "evm", logo: RELAY_ICON(56), explorer: "https://bscscan.com", feeReserve: "1000000000000000", assets: [coin("BNB", "BNB", RELAY_ICON(56)), usdc("0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", 18), usdt("0x55d398326f99059ff775485246999027b3197955", 18)] },
  { id: "avax", name: "Avalanche", chainId: 43114, vm: "evm", logo: RELAY_ICON(43114), explorer: "https://snowtrace.io", feeReserve: "10000000000000000", assets: [coin("AVAX", "Avalanche", RELAY_ICON(43114)), usdc("0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e")] },
  { id: "unichain", name: "Unichain", chainId: 130, vm: "evm", logo: RELAY_ICON(130), explorer: "https://uniscan.xyz", feeReserve: RESERVE.l2, assets: [eth(), usdc("0x078d782b760474a361dda0af3839290b0ef57ad6")] },
  { id: "linea", name: "Linea", chainId: 59144, vm: "evm", logo: RELAY_ICON(59144), explorer: "https://lineascan.build", feeReserve: RESERVE.l2, assets: [eth(), usdc("0x176211869ca2b568f2a7d4ee941e073a821ee1ff")] },
  { id: "ink", name: "Ink", chainId: 57073, vm: "evm", logo: RELAY_ICON(57073), explorer: "https://explorer.inkonchain.com", feeReserve: RESERVE.l2, assets: [eth(), usdc("0x2d270e6886d130d724215a266106e6832161eaed")] },
  { id: "world", name: "World Chain", chainId: 480, vm: "evm", logo: RELAY_ICON(480), explorer: "https://worldscan.org", feeReserve: RESERVE.l2, assets: [eth(), usdc("0x79a02482a880bce3f13e09da970dc34db4cd24d1")] },
  { id: "monad", name: "Monad", chainId: 143, vm: "evm", logo: RELAY_ICON(143), explorer: "https://monadvision.com", feeReserve: RESERVE.coin, assets: [coin("MON", "Monad", RELAY_ICON(143)), usdc("0x754704bc059f8c67012fed69bc8a327a5aafb603")] },
  { id: "hyperevm", name: "HyperEVM", chainId: 999, vm: "evm", logo: RELAY_ICON(999), explorer: "https://hyperevmscan.io", feeReserve: "10000000000000000", assets: [coin("HYPE", "Hyperliquid", RELAY_ICON(999)), usdc("0xb88339cb7199b77e23db6e890353e22632ba630f")] },
  { id: "zksync", name: "ZKsync Era", chainId: 324, vm: "evm", logo: RELAY_ICON(324), explorer: "https://explorer.zksync.io", feeReserve: RESERVE.l2, assets: [eth()] },
  { id: "scroll", name: "Scroll", chainId: 534352, vm: "evm", logo: RELAY_ICON(534352), explorer: "https://scrollscan.com", feeReserve: RESERVE.l2, assets: [eth()] },
];

const BY_ID = new Map(BRIDGE_NETWORKS.map((network) => [network.id, network]));

export const networkOf = (id: string | null | undefined): BridgeNetwork | null => (id ? (BY_ID.get(id) ?? null) : null);

export const assetOf = (network: BridgeNetwork, symbol: string | null | undefined): BridgeAsset | null => network.assets.find((asset) => asset.symbol === symbol) ?? null;

/** What a sent asset arrives as: the same one if the network has it, else one of its kind, else the network's coin. */
export function arrivalAsset(sent: BridgeAsset, to: BridgeNetwork): BridgeAsset {
  return to.assets.find((asset) => asset.symbol === sent.symbol) ?? (sent.family === "coin" ? null : to.assets.find((asset) => asset.family === sent.family)) ?? to.assets[0];
}

/** An address in the network's own format. */
export const isNetworkAddress = (network: BridgeNetwork, address: string): boolean => (network.vm === "svm" ? isSolanaAddress(address) : isEvmAddress(address));

/** The wallet that acts on a network: the EVM account for every EVM network. */
export const walletChainOf = (network: BridgeNetwork): "sol" | "rh" => (network.vm === "svm" ? "sol" : "rh");

/** A transaction's page on the network's explorer. */
export const explorerTxOf = (network: BridgeNetwork, tx: string): string => `${network.explorer}/tx/${tx}`;

/** "~5 sec", "~2 min", "~1 hr". */
export function etaParts(seconds: number): { value: number; unit: "sec" | "min" | "hr" } {
  if (seconds < 60) return { value: Math.max(1, Math.round(seconds)), unit: "sec" };
  if (seconds < 3_600) return { value: Math.round(seconds / 60), unit: "min" };
  return { value: Math.round(seconds / 3_600), unit: "hr" };
}
