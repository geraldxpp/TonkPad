"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange } from "@/shared/lib/format";
import { DEFAULT_PAIR } from "@/shared/swap/tokens";
import type { ChainId } from "@/shared/types/chain";
import { buttonClasses } from "@/shared/ui/Button";
import { Sheet } from "@/shared/ui/Sheet";
import { TokenArt } from "@/shared/ui/TokenArt";
import { formatPrice, formatQuantity, formatValue, MASK } from "../lib/format";
import type { PortfolioActivity, PortfolioAsset } from "../lib/types";
import { swapHref } from "../lib/view";
import { activityAmount, activityDetail, activityTitle, activityWhen } from "./ActivityPanel";

const ROW = "flex items-center justify-between gap-4 py-2";
const VALUE = "m-0 max-w-[65%] text-right font-mono text-[12px] [overflow-wrap:anywhere]";

const explorerToken = (chain: ChainId, address: string) => (chain === "sol" ? `https://solscan.io/token/${address}` : `https://robinhoodchain.blockscout.com/token/${address}`);

/** Whether the token has a page here: the worker only tracks launchpad tokens. */
function useHasTokenPage(address: string | null): boolean {
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    fetch(`/api/live/token/${encodeURIComponent(address)}`, { signal: controller.signal, headers: { accept: "application/json" } }).then(
      (res) => {
        if (res.ok) setFound(address);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [address]);
  return address !== null && found === address;
}

interface AssetDialogProps {
  asset: PortfolioAsset | null;
  hidden: boolean;
  onClose: () => void;
}

/** "Your position.": what it is worth, what you hold, and where to take it. */
export function AssetDialog({ asset, hidden, onClose }: AssetDialogProps) {
  const { t, href } = useI18n();
  const a = t.portfolio.assetDialog;
  const hasPage = useHasTokenPage(asset && !asset.native && !asset.stable ? asset.address : null);
  const mask = (text: string) => (hidden ? MASK : text);
  const rows: [string, string][] = asset
    ? [
        [a.value, mask(asset.valueUsd === null ? "—" : formatValue(asset.valueUsd))],
        [a.hold, mask(`${formatQuantity(asset.balance)} ${asset.symbol}`)],
        [a.price, mask(asset.priceUsd === null ? "—" : formatPrice(asset.priceUsd))],
        [a.change, mask(asset.change.h24 === null ? "—" : formatChange(asset.change.h24))],
      ]
    : [];
  const [coin, stable] = asset ? DEFAULT_PAIR[asset.chain] : ["", ""];
  return (
    <Sheet open={asset !== null} onClose={onClose} title={a.title}>
      {asset ? (
        <>
          <div className="flex items-center gap-3">
            <span data-theme="dark" className="flex size-12 flex-none overflow-hidden rounded-xl">
              <TokenArt src={asset.art} label={asset.symbol} size={48} className="size-full object-cover" />
            </span>
            <div className="min-w-0 flex-auto">
              <h3 className="truncate font-display text-[20px] font-bold">{asset.name}</h3>
              <span className="font-mono text-[11px] text-text-3">{asset.symbol}</span>
            </div>
            <span className="max-w-[90px] flex-none text-right text-[10px] text-text-3">{CHAINS[asset.chain].name}</span>
          </div>
          <dl className="m-0 border-y border-line py-3">
            {rows.map(([label, value]) => (
              <div key={label} className={ROW}>
                <dt className="text-[12px] text-text-3">{label}</dt>
                <dd className={VALUE}>{value}</dd>
              </div>
            ))}
          </dl>
          <Link href={href(swapHref(asset, coin, stable))} className={buttonClasses("cta", "md", "w-full")}>
            {a.swap}
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {hasPage ? (
              <Link href={href(`/token/${asset.address}`)} className="inline-flex items-center gap-[7px] rounded text-[12px] text-text-2 hover:text-text">
                {a.details}
                <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
              </Link>
            ) : null}
            {asset.native ? null : (
              <a href={explorerToken(asset.chain, asset.address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[7px] rounded text-[12px] text-text-2 hover:text-text">
                {a.explorer}
                <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
              </a>
            )}
          </div>
        </>
      ) : null}
    </Sheet>
  );
}

interface ActivityDialogProps {
  item: PortfolioActivity | null;
  hidden: boolean;
  loadedAt: number;
  onClose: () => void;
}

/** "Activity details.": what moved, where and when, with the transaction's link. */
export function ActivityDialog({ item, hidden, loadedAt, onClose }: ActivityDialogProps) {
  const { t, lang } = useI18n();
  const a = t.portfolio.activity;
  const d = t.portfolio.activityDialog;
  const mask = (text: string) => (hidden ? MASK : text);
  return (
    <Sheet open={item !== null} onClose={onClose} title={d.title}>
      {item ? (
        <>
          <div>
            <h3 className="font-display text-[21px] leading-[1.3] font-bold [overflow-wrap:anywhere]">{activityTitle(t, item)}</h3>
            <strong className="mt-3.5 block font-mono text-[23px] font-medium tracking-[-0.8px] [overflow-wrap:anywhere]">{mask(activityAmount(item) || "—")}</strong>
            {activityDetail(t, item) ? <p className="m-0 mt-1.5 font-mono text-[12px] text-text-3">{mask(activityDetail(t, item))}</p> : null}
          </div>
          <dl className="m-0 border-y border-line py-3">
            <div className={ROW}>
              <dt className="text-[12px] text-text-3">{d.network}</dt>
              <dd className={VALUE}>{CHAINS[item.chain].name}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-[12px] text-text-3">{d.time}</dt>
              <dd className={VALUE}>{activityWhen(t, lang, item.time, loadedAt)}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-[12px] text-text-3">{d.status}</dt>
              <dd className={cn(VALUE, item.failed ? "text-neg" : "text-pos")}>{item.failed ? a.failed : a.completed}</dd>
            </div>
          </dl>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("cta", "md", "w-full")}>
            {t.swap.viewTx}
            <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
          </a>
        </>
      ) : null}
    </Sheet>
  );
}
