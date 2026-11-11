"use client";

import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange } from "@/shared/lib/format";
import { DEFAULT_PAIR } from "@/shared/swap/tokens";
import { ChainMark } from "@/shared/ui/ChainMark";
import { TokenArt } from "@/shared/ui/TokenArt";
import { formatPrice, formatQuantity, formatValue, MASK } from "../lib/format";
import type { PortfolioAsset } from "../lib/types";
import { type AssetSort, assetKey, type PortfolioView, SORTS, swapHref } from "../lib/view";

/** Rows shown before "Show all": a long-held wallet can have hundreds. */
const FIRST_ROWS = 30;
const PHONE_ROW = "max-[699px]:relative max-[699px]:grid max-[699px]:grid-cols-[minmax(0,1fr)_auto] max-[699px]:grid-rows-[auto_auto] max-[699px]:gap-x-2.5 max-[699px]:gap-y-0.5 max-[699px]:border-t max-[699px]:border-line max-[699px]:px-[17px] max-[699px]:py-3.5";
const CELL = "border-b border-line px-3 py-[15px] font-mono text-[11px] whitespace-nowrap max-lg:px-[9px] max-[699px]:block max-[699px]:border-0 max-[699px]:p-0";
const RIGHT = "text-right";
const HEAD = "border-y border-line bg-bg/55 px-3 py-2.5 text-[10px] font-medium text-text-3 max-lg:px-[9px]";

interface AssetsPanelProps {
  assets: readonly PortfolioAsset[];
  unpriced: readonly PortfolioAsset[];
  /** Tokens with no reliable price across the wallets, shown or not. */
  unpricedTotal: number;
  view: PortfolioView;
  hidden: boolean;
  onSort: (sort: AssetSort) => void;
  onSmall: (hide: boolean) => void;
  onReset: () => void;
  onOpen: (asset: PortfolioAsset) => void;
}

function AssetIdentity({ asset, onOpen }: { asset: PortfolioAsset; onOpen: (asset: PortfolioAsset) => void }) {
  const { t } = useI18n();
  const chain = CHAINS[asset.chain].name;
  return (
    <button type="button" aria-haspopup="dialog" aria-label={fmt(t.portfolio.assets.open, { name: asset.name, chain })} onClick={() => onOpen(asset)} className="relative flex w-full min-w-0 items-center gap-2.5 rounded-lg text-left max-[699px]:items-start max-[699px]:gap-[11px]">
      <span data-theme="dark" className="flex size-[34px] flex-none overflow-hidden rounded-[9px] max-[699px]:size-9">
        <TokenArt src={asset.art} label={asset.symbol} size={36} className="size-full object-cover" />
      </span>
      <span className="absolute bottom-[-3px] left-[25px] flex rounded border-2 border-surface">
        <ChainMark chain={asset.chain} size={12} decorative />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <strong className="truncate font-sans text-[12px] font-semibold text-text">{asset.name}</strong>
        <small className="truncate font-mono text-[10px] text-text-3">{asset.symbol}</small>
      </span>
    </button>
  );
}

function AssetRow({ asset, hidden, onOpen }: { asset: PortfolioAsset; hidden: boolean; onOpen: (asset: PortfolioAsset) => void }) {
  const { t, href } = useI18n();
  const a = t.portfolio.assets;
  const mask = (text: string) => (hidden ? MASK : text);
  const change = asset.change.h24;
  const [coin, stable] = DEFAULT_PAIR[asset.chain];
  return (
    <tr className={cn("hover:bg-raised/45", PHONE_ROW)}>
      <td className={cn(CELL, "pl-6 max-lg:pl-5 max-[699px]:col-start-1 max-[699px]:row-start-1 max-[699px]:self-center")}>
        <AssetIdentity asset={asset} onOpen={onOpen} />
      </td>
      <td className={cn(CELL, RIGHT, "text-text-2 max-[699px]:hidden")}>{mask(asset.priceUsd === null ? "—" : formatPrice(asset.priceUsd))}</td>
      <td className={cn(CELL, RIGHT, "max-[699px]:col-start-2 max-[699px]:row-start-2 max-[699px]:self-end max-[699px]:text-[11px]", hidden || change === null ? "text-text-3" : change < 0 ? "text-neg" : "text-pos")}>{mask(change === null ? "—" : formatChange(change))}</td>
      <td className={cn(CELL, "text-right text-text-2 max-[699px]:col-start-1 max-[699px]:row-start-2 max-[699px]:pl-[47px] max-[699px]:text-left max-[699px]:text-[10px] max-[699px]:text-text-3")}>
        <span className="block truncate">{mask(`${formatQuantity(asset.balance)} ${asset.symbol}`)}</span>
      </td>
      <td className={cn(CELL, RIGHT, "font-semibold max-[699px]:col-start-2 max-[699px]:row-start-1 max-[699px]:self-start max-[699px]:text-[13px] max-[699px]:font-medium")}>{mask(asset.valueUsd === null ? "—" : formatValue(asset.valueUsd))}</td>
      <td className={cn(CELL, RIGHT, "pr-6 max-lg:pr-5 max-[699px]:hidden")}>
        <Link href={href(swapHref(asset, coin, stable))} aria-label={fmt(a.swapOn, { symbol: asset.symbol, chain: CHAINS[asset.chain].name })} className="inline-flex items-center rounded-[5px] border border-line-strong px-2 py-1.5 font-sans text-[10px] text-text-2 hover:bg-raised">
          {a.swap}
        </Link>
      </td>
    </tr>
  );
}

/** The holdings: filters, the table (a two-line list on phones), and tokens with no price kept out of the way. */
export function AssetsPanel({ assets, unpriced, unpricedTotal, view, hidden, onSort, onSmall, onReset, onOpen }: AssetsPanelProps) {
  const { t } = useI18n();
  const a = t.portfolio.assets;
  const [showUnpriced, setShowUnpriced] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? assets : assets.slice(0, FIRST_ROWS);
  const sortLabels: Record<AssetSort, string> = { value: a.sortValue, change: a.sortChange, name: a.sortName };
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 max-[699px]:px-[17px]">
        <span className="text-[11px] text-text-3 max-[699px]:hidden">{a.sub}</span>
        <div className="flex items-center gap-[17px] max-[699px]:w-full max-[699px]:justify-between max-[699px]:gap-2">
          <label className="flex min-h-8 cursor-pointer items-center gap-1.5 text-[11px] text-text-3">
            <input type="checkbox" checked={view.small} onChange={(event) => onSmall(event.target.checked)} className="size-3 accent-accent" />
            {a.hideSmall}
          </label>
          <label className="relative flex items-center rounded-md border border-line bg-bg">
            <span className="sr-only">{a.sortLabel}</span>
            <select value={view.sort} onChange={(event) => onSort(event.target.value as AssetSort)} className="max-w-full cursor-pointer appearance-none bg-transparent py-2 pr-7 pl-2.5 text-[11px] text-text-2">
              {SORTS.map((sort) => (
                <option key={sort} value={sort} className="bg-surface text-text">
                  {sortLabels[sort]}
                </option>
              ))}
            </select>
            <ChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-[9px] text-text-3" aria-hidden="true" />
          </label>
        </div>
      </div>
      {assets.length > 0 ? (
        <table className="w-full table-fixed border-collapse text-left max-[699px]:block">
          <thead className="max-[699px]:hidden">
            <tr>
              <th className={cn(HEAD, "w-[29%] pl-6 max-lg:w-[26%] max-lg:pl-5")}>{a.asset}</th>
              <th className={cn(HEAD, RIGHT, "w-[15%]")}>{a.price}</th>
              <th className={cn(HEAD, RIGHT, "w-[15%]")}>{a.change}</th>
              <th className={cn(HEAD, RIGHT, "w-[16%]")}>{a.holdings}</th>
              <th className={cn(HEAD, RIGHT, "w-[17%]")}>{a.value}</th>
              <th className={cn(HEAD, RIGHT, "w-[8%] pr-6 max-lg:w-[11%] max-lg:pr-5")}>
                <span className="sr-only">{a.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-[699px]:block">
            {rows.map((asset) => (
              <AssetRow key={assetKey(asset)} asset={asset} hidden={hidden} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="border-t border-line px-5 py-[50px] text-center">
          <Search size={26} strokeWidth={1.7} className="mx-auto mb-[15px] text-text-3" aria-hidden="true" />
          <h3 className="font-display text-[20px] font-bold">{a.noneTitle}</h3>
          <p className="m-0 mt-2 text-[12px] text-text-3">{a.noneBody}</p>
          <button type="button" onClick={onReset} className="mt-[19px] min-h-9 rounded-lg border border-line-strong bg-raised px-4 text-[12px] font-semibold hover:bg-input">
            {a.reset}
          </button>
        </div>
      )}
      {assets.length > FIRST_ROWS ? (
        <button type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)} className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-line text-[12px] text-text-3 hover:bg-raised/50 hover:text-text focus-visible:[outline-offset:-2px]">
          {showAll ? a.showFewer : fmt(a.showAll, { count: assets.length })}
          <ChevronDown size={14} strokeWidth={2} className={cn(showAll && "rotate-180")} aria-hidden="true" />
        </button>
      ) : null}
      {unpricedTotal > 0 ? (
        <div className="border-t border-line px-6 py-3 max-[699px]:px-[17px]">
          <button type="button" aria-expanded={showUnpriced} onClick={() => setShowUnpriced(!showUnpriced)} className="flex min-h-7 items-center gap-1.5 rounded text-[11px] font-medium text-text-2 hover:text-text">
            <ChevronDown size={13} strokeWidth={2} className={cn(showUnpriced && "rotate-180")} aria-hidden="true" />
            {showUnpriced ? a.unpricedHide : fmt(a.unpricedShow, { count: unpricedTotal })}
          </button>
          {showUnpriced ? (
            <>
              <p className="m-0 mt-1 text-[11px] leading-[1.6] text-warn">{a.unpricedNote}</p>
              <ul className="m-0 mt-2 list-none p-0">
                {unpriced.map((asset) => (
                  <li key={assetKey(asset)} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                    <span className="flex min-w-0 items-center gap-2 text-[12px]">
                      <ChainMark chain={asset.chain} size={14} decorative />
                      <span className="truncate">{asset.name}</span>
                      <span className="flex-none font-mono text-[10px] text-text-3">{asset.symbol}</span>
                    </span>
                    <span className="flex-none font-mono text-[11px] text-text-2">{hidden ? MASK : formatQuantity(asset.balance)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-between gap-2.5 border-t border-line px-6 py-[13px] text-[10px] text-text-3 max-[699px]:px-[17px]">
        <span>{a.footSource}</span>
        <span className="text-right">{a.footUnits}</span>
      </div>
    </div>
  );
}
