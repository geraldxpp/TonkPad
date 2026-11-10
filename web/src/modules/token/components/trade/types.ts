import type { ChainId } from "@/shared/types/chain";
import type { LaunchpadId } from "@/shared/types/launchpad";
import type { TradeSide } from "../../lib/trade";

/** What the trade panel needs to know about the token. */
export interface TradeToken {
  /** The token's contract (EVM) or mint (Solana) address. */
  address: string;
  name: string;
  ticker: string;
  art: string;
  chain: ChainId;
  launchpad: LaunchpadId;
  /** Still on its bonding curve (trades route through the launchpad's curve). */
  onCurve: boolean;
  priceUsd: number;
  /** The chain coin's USD price. */
  nativeUsd: number;
  /** Trade fee in percent, and the crew's share of it, when the launchpad charges them. */
  feePct: number | null;
  crewPct: number | null;
}

/** Both trade panels: the token, the side to open on, and the phone sheet's close. */
export interface TradePanelProps {
  token: TradeToken;
  initialSide?: TradeSide;
  onClose?: () => void;
}
