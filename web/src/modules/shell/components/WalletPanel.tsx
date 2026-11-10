"use client";

import { Check, Copy, LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAIN_IDS, CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import { useWallet, wallet } from "@/shared/wallet/wallet";

const ROW = "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-[13px] font-medium text-text hover:bg-input aria-disabled:cursor-wait";
const NOTE = "m-0 px-2.5 text-[12px] leading-[18px] text-text-3";

interface WalletPanelProps {
  /**
   * Closes whatever holds the panel. It runs before the wallet picker opens,
   * so the picker isn't covered by (or made inert behind) a modal sheet.
   */
  onClose: () => void;
}

/**
 * Connect a Solana or Robinhood Chain wallet, or, once connected: the chain,
 * the address with Copy, the other chain (switch to it, or connect it too)
 * and Disconnect, which ends every connection. Used by the top bar's wallet
 * menu and the More sheet.
 */
export function WalletPanel({ onClose }: WalletPanelProps) {
  const view = useWallet();
  return view.address && view.chain ? (
    <AccountView chain={view.chain} address={view.address} accounts={view.accounts} onClose={onClose} />
  ) : (
    <ConnectView onClose={onClose} />
  );
}

function ConnectView({ onClose }: WalletPanelProps) {
  const { t } = useI18n();
  const w = t.wallet;
  const view = useWallet();
  const [busy, setBusy] = useState<ChainId | null>(null);
  const [failed, setFailed] = useState(false);
  const waiting = busy !== null || view.pending;

  const start = async (chain: ChainId) => {
    if (waiting) return;
    setBusy(chain);
    setFailed(false);
    const loaded = await wallet.load();
    setBusy(null);
    if (!loaded) {
      setFailed(true);
      return;
    }
    onClose();
    await wallet.connect(chain);
  };

  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label={w.choose} className="flex flex-col gap-0.5">
        {CHAIN_IDS.map((chain) => (
          <button
            key={chain}
            type="button"
            aria-disabled={waiting || undefined}
            aria-busy={busy === chain || undefined}
            onClick={() => void start(chain)}
            className={ROW}
          >
            <ChainMark chain={chain} size={22} letterSize={10} decorative />
            <span className="flex-auto">{fmt(w.connectOn, { chain: CHAINS[chain].name })}</span>
            {busy === chain ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin text-text-2" aria-label={w.loading} role="img" /> : null}
          </button>
        ))}
      </div>
      <p className={NOTE}>{w.note}</p>
      {failed || view.phase === "unavailable" ? (
        <p role="alert" className="m-0 px-2.5 pt-1 text-[12px] leading-[18px] text-neg">
          {w.unavailable}
        </p>
      ) : null}
    </div>
  );
}

interface AccountViewProps extends WalletPanelProps {
  chain: ChainId;
  address: string;
  accounts: Partial<Record<ChainId, string>>;
}

function AccountView({ chain, address, accounts, onClose }: AccountViewProps) {
  const { t } = useI18n();
  const w = t.wallet;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const other: ChainId = chain === "sol" ? "rh" : "sol";
  const otherConnected = Boolean(accounts[other]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      return; // Clipboard blocked: nothing to confirm.
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  const switchChain = () => {
    // A chain without a connection opens the wallet picker, which must not sit behind this panel.
    if (!otherConnected) onClose();
    void wallet.switchChain(other);
  };

  const disconnect = () => {
    onClose();
    void wallet.disconnect();
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2">
        <ChainMark chain={chain} size={28} letterSize={12} decorative />
        <div className="flex min-w-0 flex-auto flex-col">
          <span className="text-[12px] text-text-3">{fmt(w.connectedOn, { chain: CHAINS[chain].name })}</span>
          <span className="truncate font-mono text-[14px] font-semibold text-text" title={address}>
            {shortAddress(address)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={w.copy}
          title={w.copy}
          className="inline-flex size-8 flex-none items-center justify-center rounded-[10px] border border-line bg-surface text-text-2 hover:text-text"
        >
          {copied ? <Check size={15} strokeWidth={2.4} className="text-pos" aria-hidden="true" /> : <Copy size={15} strokeWidth={2} aria-hidden="true" />}
        </button>
      </div>
      <div className="h-px bg-line" />
      <button type="button" onClick={switchChain} className={ROW}>
        <ChainMark chain={other} size={22} letterSize={10} decorative />
        <span className="flex-auto">{fmt(otherConnected ? w.switchTo : w.connectOn, { chain: CHAINS[other].name })}</span>
      </button>
      <button type="button" onClick={disconnect} className={ROW}>
        <span className="inline-flex size-[22px] flex-none items-center justify-center text-text-2" aria-hidden="true">
          <LogOut size={16} strokeWidth={2} />
        </span>
        <span className="flex-auto">{w.disconnect}</span>
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? w.copied : ""}
      </span>
    </div>
  );
}
