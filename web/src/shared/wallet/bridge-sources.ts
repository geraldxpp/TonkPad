import { arbitrum, avalanche, base, bsc, hyperEvm, ink, linea, mainnet, monad, optimism, polygon, scroll, unichain, worldchain, zksync } from "@reown/appkit/networks";

/** The other networks the bridge sends from. Only ever used for a bridge's own transaction; everything else stays on Robinhood Chain. */
export const BRIDGE_SOURCES = [mainnet, base, arbitrum, optimism, polygon, bsc, avalanche, unichain, linea, ink, worldchain, monad, hyperEvm, zksync, scroll] as const;
