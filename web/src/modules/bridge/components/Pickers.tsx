"use client";

import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { Sheet } from "@/shared/ui/Sheet";
import { TokenArt } from "@/shared/ui/TokenArt";
import { type BridgeAsset, BRIDGE_NETWORKS, type BridgeNetwork } from "../lib/networks";
import { NetworkMark } from "./NetworkMark";

interface NetworkPickerProps {
  side: "from" | "to" | null;
  selected: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** Choose a network, by name or by its coin. */
export function NetworkPicker({ side, selected, onPick, onClose }: NetworkPickerProps) {
  const { t } = useI18n();
  const n = t.bridge.networks;
  const [query, setQuery] = useState("");
  const close = () => {
    setQuery("");
    onClose();
  };
  const q = query.trim().toLowerCase();
  const list = BRIDGE_NETWORKS.filter((network: BridgeNetwork) => `${network.name} ${network.assets[0].symbol}`.toLowerCase().includes(q));
  return (
    <Sheet open={side !== null} onClose={close} title={side === "to" ? n.chooseTo : n.chooseFrom}>
      <label className="flex items-center gap-[9px] rounded-lg border border-line-strong bg-bg px-[13px] py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cta">
        <Search size={16} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
        <span className="sr-only">{n.search}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={n.search} autoComplete="off" className="w-full min-w-0 bg-transparent text-[13px] text-text outline-none placeholder:text-text-3" />
      </label>
      <div className="-mx-5 max-h-[52dvh] overflow-y-auto">
        {list.map((network) => (
          <button key={network.id} type="button" aria-pressed={network.id === selected} onClick={() => { setQuery(""); onPick(network.id); }} className={cn("flex min-h-14 w-full items-center gap-3 px-5 py-[11px] text-left hover:bg-accent/6 focus-visible:[outline-offset:-2px]", network.id === selected && "bg-accent/6")}>
            <NetworkMark network={network} size={33} />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <strong className="text-[13px] font-semibold">{network.name}</strong>
              <small className="text-[11px] text-text-3">{fmt(n.fees, { symbol: network.assets[0].symbol })}</small>
            </span>
            {network.id === selected ? <span className="flex-none text-[11px] text-accent-text">{n.selected}</span> : null}
          </button>
        ))}
        {list.length === 0 ? <p className="m-0 px-5 py-[30px] text-center text-[13px] text-text-3">{n.none}</p> : null}
      </div>
    </Sheet>
  );
}

interface AssetPickerProps {
  side: "from" | "to" | null;
  network: BridgeNetwork;
  selected: string;
  onPick: (symbol: string) => void;
  onClose: () => void;
}

/** Choose what to send, or what to receive, from what that network offers. */
export function AssetPicker({ side, network, selected, onPick, onClose }: AssetPickerProps) {
  const { t } = useI18n();
  const a = t.bridge.assets;
  return (
    <Sheet open={side !== null} onClose={onClose} title={side === "to" ? a.titleTo : a.title} subtitle={fmt(a.on, { network: network.name })}>
      <div className="flex flex-col gap-[9px]">
        {network.assets.map((asset: BridgeAsset) => (
          <button key={asset.symbol} type="button" aria-pressed={asset.symbol === selected} onClick={() => onPick(asset.symbol)} className={cn("flex items-center gap-[11px] rounded-[9px] border p-3.5 text-left", asset.symbol === selected ? "border-accent bg-accent/5" : "border-line hover:bg-raised")}>
            <TokenArt src={asset.art} label={asset.symbol} size={35} className="size-[35px] flex-none rounded-full object-cover" />
            <span className="flex min-w-0 flex-col gap-1">
              <strong className="font-mono text-[13px] font-semibold">{asset.symbol}</strong>
              <small className="text-[11px] text-text-3">{asset.name}</small>
            </span>
            <ChevronRight size={15} strokeWidth={2} className="ml-auto flex-none text-text-3" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="m-0 text-[11px] text-text-3">{a.note}</p>
    </Sheet>
  );
}
