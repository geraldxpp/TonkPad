"use client";

import { ArrowDownLeft, ArrowDownUp, ArrowRightLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import type { ChainView as ChainData } from "../hooks/usePortfolio";
import { formatShare, MASK } from "../lib/format";
import { type ChainView, totalsOf } from "../lib/view";

const ACTION = "flex flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-1.5 py-2.5 text-[11px] font-semibold hover:bg-input";

interface WalletOverviewProps {
  chains: readonly ChainData[];
  chain: ChainView;
  onChain: (chain: ChainView) => void;
  hidden: boolean;
  onReceive: () => void;
  onWallets: () => void;
  onConnect: (chain: ChainId) => void;
  swapHref: string;
}

/** "Across your wallets": each network's balance and share, filters for the page, and the quick actions. */
export function WalletOverview({ chains, chain, onChain, hidden, onReceive, onWallets, onConnect, swapHref }: WalletOverviewProps) {
  const { t, href } = useI18n();
  const w = t.portfolio.wallets;
  const values = Object.fromEntries(chains.map((item) => [item.chain, totalsOf(item.data?.assets ?? []).total])) as Record<ChainId, number>;
  const total = chains.reduce((sum, item) => sum + values[item.chain], 0);
  const connected = chains.filter((item) => item.owner !== null).length;
  const share = (id: ChainId) => (hidden || total === 0 ? 50 : (values[id] / total) * 100);
  return (
    <aside aria-labelledby="wallets-title" className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface px-[22px] pt-[23px] max-lg:px-[18px] max-[699px]:order-2">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id="wallets-title" className="font-display text-[18px] font-bold tracking-[-0.5px]">
          {w.title}
        </h2>
        <span className="rounded border border-line bg-raised px-[5px] py-0.5 font-mono text-[10px] text-text-3">{connected}</span>
      </div>
      <p className="m-0 mt-[7px] text-[11px] text-text-3">{w.sub}</p>
      <div className="mt-[23px] flex flex-col gap-[17px]">
        {chains.map((item) => {
          const name = CHAINS[item.chain].name;
          const label = item.chain === "rh" ? w.evmWallet : w.solWallet;
          if (!item.owner) {
            return (
              <div key={item.chain} className="flex items-center gap-[11px] border-b border-line pb-4">
                <ChainMark chain={item.chain} size={34} decorative className="flex-none" />
                <span className="min-w-0 flex-auto">
                  <strong className="block text-[12px] font-semibold">{name}</strong>
                  <small className="mt-[3px] block text-[11px] text-text-3">{w.notConnected}</small>
                </span>
                <button type="button" onClick={() => onConnect(item.chain)} aria-label={fmt(w.connectOn, { chain: name })} className="flex-none rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-[11px] font-semibold hover:bg-input">
                  {w.connect}
                </button>
              </div>
            );
          }
          const value = item.data ? formatUsd(values[item.chain]) : "—";
          return (
            <button key={item.chain} type="button" aria-pressed={chain === item.chain} onClick={() => onChain(chain === item.chain ? "all" : item.chain)} className="grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-[11px] gap-y-[7px] border-b border-line pb-4 text-left">
              <span className="row-span-2 self-start">
                <ChainMark chain={item.chain} size={34} decorative />
              </span>
              <span className="min-w-0">
                <strong className={cn("block text-[12px] font-semibold", chain === item.chain && "text-accent-text")}>{name}</strong>
                <small className="mt-[3px] block truncate text-[11px] text-text-3">
                  {label} <span className="font-mono text-[10px]">{shortAddress(item.owner)}</span>
                </small>
              </span>
              <ChevronRight size={13} strokeWidth={2} className="justify-self-end text-text-3" aria-hidden="true" />
              <strong className="min-w-0 font-mono text-[17px] font-medium tracking-[-0.6px] [overflow-wrap:anywhere]">{hidden ? MASK : value}</strong>
              <span className={cn("justify-self-end font-mono text-[10px]", item.failed ? "text-warn" : "text-text-3")}>{item.failed ? w.failed : hidden ? MASK : formatShare(values[item.chain], total)}</span>
            </button>
          );
        })}
      </div>
      <div role="img" aria-label={hidden ? w.allocationHidden : fmt(w.allocation, { rh: formatShare(values.rh, total), sol: formatShare(values.sol, total) })} className="mt-[19px] flex h-1 gap-[3px] overflow-hidden rounded">
        <span className="block h-full bg-accent" style={{ width: `${share("rh")}%` }} />
        <span className="block h-full bg-agent" style={{ width: `${share("sol")}%` }} />
      </div>
      <div className="mt-[9px] flex justify-between gap-2.5 text-[10px] text-text-3">
        <span className="flex items-center gap-[5px]">
          <i aria-hidden="true" className="size-1 rounded-sm bg-accent" />
          {CHAINS.rh.name}
        </span>
        <span className="flex items-center gap-[5px]">
          <i aria-hidden="true" className="size-1 rounded-sm bg-agent" />
          {CHAINS.sol.name}
        </span>
      </div>
      <div className="mt-auto flex gap-[9px] pt-5 max-md:hidden">
        <button type="button" onClick={onReceive} className={ACTION}>
          <ArrowDownLeft size={13} strokeWidth={2} className="text-accent-text" aria-hidden="true" />
          {w.receive}
        </button>
        <Link href={href(swapHref)} className={ACTION}>
          <ArrowDownUp size={13} strokeWidth={2} className="text-accent-text" aria-hidden="true" />
          {w.swap}
        </Link>
        <Link href={href("/bridge")} className={ACTION}>
          <ArrowRightLeft size={13} strokeWidth={2} className="text-accent-text" aria-hidden="true" />
          {w.bridge}
        </Link>
      </div>
      <button type="button" aria-haspopup="dialog" onClick={onWallets} className="flex min-h-[43px] items-center justify-center gap-[7px] text-[11px] text-text-3 hover:text-text">
        {w.manage}
        <ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
      </button>
    </aside>
  );
}
