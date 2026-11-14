"use client";

import { TriangleAlert } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { useWallet } from "./wallet";

/** Robinhood Chain mainnet: MetaMask runs Smart Transactions there (not on the testnet). */
const ROBINHOOD_MAINNET = 4663;

/**
 * True when the connected wallet is MetaMask on Robinhood Chain mainnet.
 * MetaMask's Smart Transactions simulate a transaction first and cancel what
 * they predict will fail, and their simulator can't run the chain's ArbSys
 * precompile, which the launchpad reads on every launch and curve buy for
 * its launch-block shield. So MetaMask warns "likely to fail" and cancels a
 * transaction the chain itself accepts; with Smart Transactions off it goes
 * through.
 */
export function needsSmartTransactionsOff(chainId: number, wallet: string | null): boolean {
  return chainId === ROBINHOOD_MAINNET && /metamask/i.test(wallet ?? "");
}

/** Before a launch or a curve buy, tells a MetaMask user to turn Smart Transactions off. Nothing for anyone else. */
export function SmartTransactionsNotice({ chainId }: { chainId: number }) {
  const { t } = useI18n();
  const { evmWallet } = useWallet();
  if (!needsSmartTransactionsOff(chainId, evmWallet)) return null;
  return (
    <p role="note" className="m-0 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/7 px-3.5 py-3 text-[12px] leading-[1.6] text-warn">
      <TriangleAlert size={15} strokeWidth={2.2} className="mt-0.5 flex-none" aria-hidden="true" />
      <span>{t.wallet.smartTransactions}</span>
    </p>
  );
}
