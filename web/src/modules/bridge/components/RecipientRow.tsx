"use client";

import { Check, Copy, Wallet } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import type { BridgeNetwork } from "../lib/networks";

interface RecipientRowProps {
  network: BridgeNetwork;
  /** The wallet connected for that network, or null. */
  owner: string | null;
  custom: boolean;
  address: string;
  /** Something is typed and it isn't an address on that network. */
  bad: boolean;
  onCustom: (on: boolean) => void;
  onAddress: (text: string) => void;
}

/** Where it arrives: the connected wallet, or an address typed in and checked against the network's format. */
export function RecipientRow({ network, owner, custom, address, bad, onCustom, onAddress }: RecipientRowProps) {
  const { t } = useI18n();
  const r = t.bridge.recipient;
  const inputId = useId();
  const errorId = useId();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = custom ? (address.trim() && !bad ? address.trim() : null) : owner;
  const copy = () => {
    if (!shown) return;
    void navigator.clipboard.writeText(shown).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }, () => undefined);
  };
  return (
    <div className="border-b border-line py-[18px] max-[599px]:px-0.5 max-[599px]:py-[15px]">
      <div className="flex items-center gap-2.5 max-[599px]:flex-wrap max-[599px]:gap-2">
        <span className="flex size-[31px] flex-none items-center justify-center rounded-lg bg-raised text-text-3 max-[599px]:size-[27px]">
          <Wallet size={15} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <span className="block text-[12px] font-semibold text-text-2">{custom ? r.another : r.mine}</span>
          <span className="mt-[3px] flex items-center gap-[5px] text-text-3">
            <span className="max-w-[140px] truncate font-mono text-[10px]">{shown ? shortAddress(shown) : custom ? r.enter : r.notConnected}</span>
            {shown ? (
              <button type="button" onClick={copy} aria-label={copied ? r.copied : r.copy} title={copied ? r.copied : r.copy} className="inline-flex size-[22px] items-center justify-center rounded hover:text-text">
                {copied ? <Check size={12} strokeWidth={2.4} className="text-pos" aria-hidden="true" /> : <Copy size={11} strokeWidth={2} aria-hidden="true" />}
              </button>
            ) : null}
          </span>
        </div>
        <label className="ml-auto flex min-h-9 cursor-pointer items-center gap-1.5 text-[11px] text-text-3 max-[599px]:max-w-[130px]">
          <input type="checkbox" checked={custom} onChange={(event) => onCustom(event.target.checked)} className="size-3 flex-none accent-accent" />
          {r.useAnother}
        </label>
      </div>
      {custom ? (
        <div className="mt-[15px]">
          <label htmlFor={inputId} className="text-[11px] text-text-2">
            {fmt(r.receiveOn, { network: network.name })}
          </label>
          <input id={inputId} type="text" autoComplete="off" spellCheck={false} value={address} onChange={(event) => onAddress(event.target.value)} placeholder={network.vm === "svm" ? r.placeholderSol : r.placeholderEvm} aria-invalid={bad} aria-describedby={bad ? errorId : undefined} className="mt-1.5 w-full rounded-lg border border-line-strong bg-bg p-3 font-mono text-[12px] text-text placeholder:text-text-3" />
          {bad ? (
            <p id={errorId} role="alert" className="m-0 mt-2 text-[11px] text-neg">
              {fmt(network.vm === "svm" ? r.invalidSol : r.invalidEvm, { network: network.name })}
            </p>
          ) : (
            <p className="m-0 mt-2 text-[11px] text-text-3">{r.warning}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
