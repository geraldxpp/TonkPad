"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useWallet } from "./wallet";

/** Robinhood Chain mainnet: where MetaMask's preview misreads the launchpad (not on the testnet). */
const ROBINHOOD_MAINNET = 4663;

/**
 * True when the connected wallet is MetaMask on Robinhood Chain mainnet.
 * MetaMask test-runs every transaction on its own simulator before showing
 * it, and that simulator answers the chain's ArbSys block lookup with random
 * data. The launchpad reads it on every launch and curve buy for the Block-0
 * Shield, so MetaMask's preview says "likely to fail" for transactions the
 * chain accepts. The site sends them in the legacy format, which MetaMask
 * doesn't cancel (see fees.ts); its warning stays, so the review explains it.
 */
export function warnsLikelyToFail(chainId: number, wallet: string | null): boolean {
  return chainId === ROBINHOOD_MAINNET && /metamask/i.test(wallet ?? "");
}

/** Before a launch or a curve buy, tells a MetaMask user why their wallet may warn. Nothing for anyone else. */
export function LikelyToFailNote({ chainId }: { chainId: number }) {
  const { t } = useI18n();
  const { evmWallet } = useWallet();
  if (!warnsLikelyToFail(chainId, evmWallet)) return null;
  return (
    <p role="note" className="m-0 flex items-start gap-2 rounded-lg border border-line bg-raised px-3.5 py-3 text-[12px] leading-[1.6] text-text-2">
      <ShieldCheck size={15} strokeWidth={2.2} className="mt-0.5 flex-none text-accent-text" aria-hidden="true" />
      <span>{t.wallet.likelyToFail}</span>
    </p>
  );
}
