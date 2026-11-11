"use client";

import { Fuel } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { BridgeAsset, BridgeNetwork } from "../lib/networks";

interface GasOptionProps {
  to: BridgeNetwork;
  receive: BridgeAsset;
  on: boolean;
  /** The destination wallet has none of that network's coin yet. */
  empty: boolean;
  onChange: (on: boolean) => void;
}

/** "Arrive ready to go.": a little of the destination's coin delivered with the transfer, so the next transaction can be paid for. */
export function GasOption({ to, receive, on, empty, onChange }: GasOptionProps) {
  const { t } = useI18n();
  const g = t.bridge.gas;
  const coin = to.assets[0].symbol;
  const arrivesAsGas = receive.native;
  const unsupported = to.vm === "svm";
  const disabled = arrivesAsGas || unsupported;
  const help = arrivesAsGas ? fmt(g.already, { symbol: coin }) : unsupported ? fmt(g.unsupported, { network: to.name }) : fmt(g.help, { symbol: coin });
  return (
    <label className="relative flex cursor-pointer items-center gap-[11px] py-[17px] has-[input:disabled]:cursor-default has-[input:disabled]:opacity-60 max-[599px]:gap-[9px] max-[599px]:px-0.5 max-[599px]:py-[15px]">
      <span className="flex size-[31px] flex-none items-center justify-center rounded-lg bg-accent/7 text-accent-text max-[599px]:size-[27px]">
        <Fuel size={15} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <strong className="block text-[12px] font-semibold">{g.title}</strong>
        <small className="mt-1 block text-[11px] leading-[1.5] text-text-3">{help}</small>
        {!disabled ? <span className="mt-0.5 block text-[10px] text-text-3">{empty ? fmt(g.empty, { symbol: coin, network: to.name }) : g.cost}</span> : null}
      </span>
      <input type="checkbox" role="switch" aria-label={g.label} checked={on && !disabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer absolute right-0 z-[2] m-0 h-6 w-[34px] cursor-pointer opacity-0 disabled:cursor-default" />
      <span aria-hidden="true" className="relative ml-auto block h-[19px] w-[33px] flex-none rounded-[20px] border border-line-strong bg-input transition-colors duration-200 before:absolute before:top-[3px] before:left-[3px] before:size-[11px] before:rounded-full before:bg-text-3 before:transition-transform before:duration-200 peer-checked:border-accent peer-checked:bg-accent peer-checked:before:translate-x-[14px] peer-checked:before:bg-on-cta peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-cta motion-reduce:transition-none motion-reduce:before:transition-none" />
    </label>
  );
}
