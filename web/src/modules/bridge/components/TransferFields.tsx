"use client";

import { ArrowDownUp, ChevronDown, Clock3 } from "lucide-react";
import { useId } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { TokenArt } from "@/shared/ui/TokenArt";
import type { BridgeForm } from "../hooks/useBridgeForm";
import type { BridgeAsset, BridgeNetwork } from "../lib/networks";
import { NetworkMark } from "./NetworkMark";

/** The whole field takes the focus ring, so it follows the card's shape rather than boxing the digits. */
const FIELD = "rounded-xl border border-line bg-bg p-4 focus-within:border-accent/60 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-cta max-[599px]:rounded-[10px] max-[599px]:p-3";
const ENDPOINT = "min-w-[27px] flex-none text-[11px] text-text-3";
const META = "mt-3 flex min-h-4 items-center justify-between gap-2.5 font-mono text-[11px] text-text-3";

function NetworkButton({ network, label, onClick }: { network: BridgeNetwork; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={label} className="flex min-h-9 min-w-0 items-center gap-[7px] rounded text-left text-[13px] font-semibold">
      <NetworkMark network={network} size={23} />
      <span className="truncate">{network.name}</span>
      <ChevronDown size={12} strokeWidth={2} className="ml-[3px] flex-none text-text-3" aria-hidden="true" />
    </button>
  );
}

function AssetButton({ asset, label, onClick }: { asset: BridgeAsset; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={label} className="flex flex-none items-center gap-[7px] rounded-3xl border border-line-strong bg-raised py-1.5 pr-[9px] pl-1.5 font-mono text-[13px] font-semibold hover:border-accent/45">
      <TokenArt src={asset.art} label={asset.symbol} size={25} className="size-[25px] rounded-full object-cover" />
      <span>{asset.symbol}</span>
      <ChevronDown size={12} strokeWidth={2} className="ml-0.5 flex-none text-text-3" aria-hidden="true" />
    </button>
  );
}

interface TransferFieldsProps {
  form: BridgeForm;
  /** What arrives, its USD value, and how long it takes; empty until there's a route. */
  received: string;
  sentUsd: string | null;
  receivedUsd: string | null;
  eta: string | null;
  loading: boolean;
  balance: string | null;
  onNetwork: (side: "from" | "to") => void;
  onAsset: (side: "from" | "to") => void;
  onPreset: (pct: number) => void;
}

/** From and To: each network, the amount going in and what arrives, and the switch between them. */
export function TransferFields({ form, received, sentUsd, receivedUsd, eta, loading, balance, onNetwork, onAsset, onPreset }: TransferFieldsProps) {
  const { t } = useI18n();
  const f = t.bridge.fields;
  const amountId = useId();
  const presets = [
    { label: "25%", pct: 25 },
    { label: "50%", pct: 50 },
    { label: t.token.trade.max, pct: 100 },
  ];
  return (
    <div className="relative">
      <div data-focus-field className={FIELD}>
        <div className="flex items-center justify-between gap-3 max-[599px]:gap-1.5">
          <div className="flex min-w-0 items-center gap-2.5 max-[599px]:gap-[7px]">
            <span className={ENDPOINT}>{f.from}</span>
            <NetworkButton network={form.from} label={fmt(f.changeFrom, { name: form.from.name })} onClick={() => onNetwork("from")} />
          </div>
          {balance !== null ? (
            <div role="group" aria-label={f.presets} className="flex flex-none gap-1 max-[599px]:gap-0.5">
              {presets.map((preset) => (
                <button key={preset.pct} type="button" onClick={() => onPreset(preset.pct)} className="min-h-[26px] min-w-[27px] rounded px-[5px] py-[3px] font-mono text-[10px] text-text-3 hover:bg-raised hover:text-accent-text">
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label htmlFor={amountId} className="sr-only">
          {f.amount}
        </label>
        <div className="mt-[17px] flex min-h-[43px] items-center justify-between gap-3 max-[599px]:mt-3.5 max-[599px]:min-h-[38px] max-[599px]:gap-[7px]">
          <input id={amountId} inputMode="decimal" autoComplete="off" placeholder="0" value={form.amount} onChange={(event) => form.setAmount(event.target.value)} className="w-full min-w-0 bg-transparent font-mono text-[34px] leading-10 font-medium tracking-[-0.05em] text-text outline-none placeholder:text-text-3 max-[599px]:text-[30px]" />
          <AssetButton asset={form.asset} label={fmt(f.chooseAsset, { symbol: form.asset.symbol })} onClick={() => onAsset("from")} />
        </div>
        <div className={META}>
          <span>{sentUsd ?? ""}</span>
          <span>{balance === null ? "" : `${f.balance} ${balance}`}</span>
        </div>
      </div>
      <button type="button" onClick={form.reverse} aria-label={f.reverse} title={f.reverse} className="absolute top-[calc(50%-18px)] left-[calc(50%-18px)] z-[2] flex size-9 items-center justify-center rounded-[10px] border-4 border-surface bg-raised text-accent-text max-[599px]:top-[calc(50%-16.5px)] max-[599px]:left-[calc(50%-16.5px)] max-[599px]:size-[33px]">
        <ArrowDownUp size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className={cn(FIELD, "mt-2.5 pt-[17px] [background:linear-gradient(110deg,rgb(var(--accent-rgb)/0.035),var(--bg))] max-[599px]:pt-3.5")}>
        <div className="flex items-center justify-between gap-3 max-[599px]:gap-1.5">
          <div className="flex min-w-0 items-center gap-2.5 max-[599px]:gap-[7px]">
            <span className={ENDPOINT}>{f.to}</span>
            <NetworkButton network={form.to} label={fmt(f.changeTo, { name: form.to.name })} onClick={() => onNetwork("to")} />
          </div>
          <span className="flex-none text-right text-[10px] text-text-3">{f.estimated}</span>
        </div>
        <div className="mt-[17px] flex min-h-[43px] items-center justify-between gap-3 max-[599px]:mt-3.5 max-[599px]:min-h-[38px] max-[599px]:gap-[7px]">
          <output aria-label={f.receiveLabel} aria-busy={loading || undefined} className={cn("min-w-0 truncate font-mono text-[31px] leading-10 font-medium tracking-[-0.05em] max-[599px]:text-[29px]", loading ? "text-text-3" : "text-text")}>
            {received || "0"}
          </output>
          <AssetButton asset={form.receive} label={fmt(f.chooseReceive, { symbol: form.receive.symbol })} onClick={() => onAsset("to")} />
        </div>
        <div className={META}>
          <span>{receivedUsd ?? ""}</span>
          {eta ? (
            <span className="flex items-center gap-1 text-accent-text">
              <Clock3 size={12} strokeWidth={2} aria-hidden="true" />
              {eta}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
