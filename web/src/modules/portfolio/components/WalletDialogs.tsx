"use client";

import { ArrowUpRight, Check, Copy, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";
import { buttonClasses } from "@/shared/ui/Button";
import { ChainMark } from "@/shared/ui/ChainMark";
import { Sheet } from "@/shared/ui/Sheet";

const NOTE = "m-0 flex items-start gap-[9px] rounded-lg bg-raised p-3 text-[11px] leading-[1.7] text-text-2";

/** Copies text and briefly says so. */
function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    (text) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }, () => undefined);
    },
  ];
}

const explorerAddress = (chain: ChainId, address: string) => (chain === "sol" ? `https://solscan.io/account/${address}` : `https://robinhoodchain.blockscout.com/address/${address}`);

interface ReceiveDialogProps {
  open: boolean;
  onClose: () => void;
  accounts: Partial<Record<ChainId, string>>;
  chain: ChainId;
  onChain: (chain: ChainId) => void;
  onConnect: (chain: ChainId) => void;
}

/** "Receive assets.": the wallet's address on the chosen network, and what not to send to it. */
export function ReceiveDialog({ open, onClose, accounts, chain, onChain, onConnect }: ReceiveDialogProps) {
  const { t } = useI18n();
  const r = t.portfolio.receive;
  const [copied, copy] = useCopied();
  const address = accounts[chain] ?? null;
  const name = CHAINS[chain].name;
  return (
    <Sheet open={open} onClose={onClose} title={r.title} subtitle={r.body}>
      <div role="group" aria-label={r.label} className="flex gap-2">
        {(["rh", "sol"] as const).map((id) => (
          <button key={id} type="button" aria-pressed={id === chain} onClick={() => onChain(id)} className={cn("flex flex-1 items-center justify-center gap-[7px] rounded-lg border bg-bg px-[7px] py-[11px] text-[12px]", id === chain ? "border-accent bg-accent/5" : "border-line")}>
            <ChainMark chain={id} size={21} decorative />
            {CHAINS[id].name}
          </button>
        ))}
      </div>
      {address ? (
        <>
          <div className="rounded-[10px] border border-line bg-bg px-[18px] py-5 text-center">
            <span className="block text-[11px] text-text-3">{fmt(r.on, { chain: name })}</span>
            <code data-testid="receive-address" className="mt-4 block font-mono text-[12px] leading-[1.9] [overflow-wrap:anywhere] text-text-2">
              {address}
            </code>
            <button type="button" onClick={() => copy(address)} className="mt-[19px] inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-raised text-[12px] font-semibold hover:bg-input">
              {copied ? <Check size={14} strokeWidth={2.4} className="text-pos" aria-hidden="true" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
              {copied ? r.copied : r.copy}
            </button>
            <span aria-live="polite" className="sr-only">
              {copied ? r.copied : ""}
            </span>
          </div>
          <p className={NOTE}>
            <Info size={13} strokeWidth={2} className="mt-0.5 flex-none" aria-hidden="true" />
            <span>{chain === "rh" ? r.warnRh : r.warnSol}</span>
          </p>
        </>
      ) : (
        <button type="button" onClick={() => onConnect(chain)} className={buttonClasses("cta", "md", "w-full")}>
          {fmt(r.connect, { chain: name })}
        </button>
      )}
    </Sheet>
  );
}

interface WalletsDialogProps {
  open: boolean;
  onClose: () => void;
  accounts: Partial<Record<ChainId, string>>;
  onConnect: (chain: ChainId) => void;
}

function WalletRow({ chain, address, onConnect }: { chain: ChainId; address: string | null; onConnect: (chain: ChainId) => void }) {
  const { t } = useI18n();
  const w = t.portfolio.walletsDialog;
  const [copied, copy] = useCopied();
  const name = CHAINS[chain].name;
  return (
    <div className="flex items-center gap-3 border-t border-line py-4">
      <ChainMark chain={chain} size={35} decorative className="flex-none" />
      <div className="flex min-w-0 flex-auto flex-col gap-1">
        <strong className="text-[12px] font-semibold">{name}</strong>
        {address ? (
          <a href={explorerAddress(chain, address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start rounded font-mono text-[11px] text-text-3 hover:text-text">
            {shortAddress(address)}
            <ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
          </a>
        ) : (
          <small className="text-[11px] text-text-3">{t.portfolio.wallets.notConnected}</small>
        )}
      </div>
      {address ? (
        <button type="button" onClick={() => copy(address)} aria-label={fmt(w.copy, { chain: name })} className="inline-flex size-9 flex-none items-center justify-center rounded-lg border border-line hover:bg-raised">
          {copied ? <Check size={13} strokeWidth={2.4} className="text-pos" aria-hidden="true" /> : <Copy size={13} strokeWidth={2} aria-hidden="true" />}
        </button>
      ) : (
        <button type="button" onClick={() => onConnect(chain)} aria-label={fmt(t.portfolio.wallets.connectOn, { chain: name })} className="flex-none rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-[11px] font-semibold hover:bg-input">
          {t.portfolio.wallets.connect}
        </button>
      )}
    </div>
  );
}

/** "Your wallets.": each network's address with Copy, and Connect for any still missing. */
export function WalletsDialog({ open, onClose, accounts, onConnect }: WalletsDialogProps) {
  const { t } = useI18n();
  const w = t.portfolio.walletsDialog;
  return (
    <Sheet open={open} onClose={onClose} title={w.title} subtitle={w.body}>
      <div>
        {(["rh", "sol"] as const).map((chain) => (
          <WalletRow key={chain} chain={chain} address={accounts[chain] ?? null} onConnect={onConnect} />
        ))}
      </div>
      <button type="button" onClick={onClose} className={buttonClasses("cta", "md", "w-full")}>
        {w.done}
      </button>
    </Sheet>
  );
}
