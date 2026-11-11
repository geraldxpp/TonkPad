"use client";

import { ArrowDownLeft, ArrowDownUp, ArrowRightLeft, ArrowUpRight, Compass, Layers, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { usePolling } from "@/shared/live/usePolling";
import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import { useWallet, wallet } from "@/shared/wallet/wallet";
import { ActivityPanel } from "./components/ActivityPanel";
import { AssetsPanel } from "./components/AssetsPanel";
import { BalanceCard } from "./components/BalanceCard";
import { ActivityDialog, AssetDialog } from "./components/DetailDialogs";
import { HoldingsCard } from "./components/HoldingsCard";
import { ConnectState, EmptyState, FailedState, LoadingState } from "./components/States";
import { ReceiveDialog, WalletsDialog } from "./components/WalletDialogs";
import { WalletOverview } from "./components/WalletOverview";
import { useActivity } from "./hooks/useActivity";
import { useBalancePrivacy } from "./hooks/useBalancePrivacy";
import { usePortfolio } from "./hooks/usePortfolio";
import { isMarketSeries, marketPath } from "./lib/api";
import { downloadText, holdingsCsv } from "./lib/csv";
import { portfolioSeries } from "./lib/series";
import type { PortfolioActivity, PortfolioAsset } from "./lib/types";
import { type ChainView, inChain, parseView, totalsOf, unpricedAssets, visibleActivity, visibleAssets } from "./lib/view";

const MARKET_REFRESH_MS = 300_000;
const chainName = (chain: ChainId) => CHAINS[chain].name;

const DOCK = "flex min-h-11 flex-1 items-center justify-center gap-[7px] rounded-lg border text-[12px]";
const DOCK_PLAIN = "border-line-strong bg-raised text-text-2";

/** Module 5: Portfolio. What the connected wallets hold across both networks, read live from the chains. */
export function PortfolioScreen() {
  const { t, lang, href } = useI18n();
  const p = t.portfolio;
  const { params, setParams } = useUrlParams();
  const view = parseView(params);
  const data = usePortfolio();
  const { accounts, phase } = useWallet();
  const [hidden, toggleHidden] = useBalancePrivacy();
  const [receiving, setReceiving] = useState<ChainId | null>(null);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [asset, setAsset] = useState<PortfolioAsset | null>(null);
  const [activityItem, setActivityItem] = useState<PortfolioActivity | null>(null);

  const owners = data.chains.flatMap((chain) => (chain.owner ? [[chain.chain, chain.owner] as const] : []));
  const activity = useActivity(owners, view.tab === "activity", data.refreshes);
  const { data: rawMarket } = usePolling<unknown>(data.connected ? marketPath(view.range) : null, null, MARKET_REFRESH_MS);
  const market = isMarketSeries(rawMarket, view.range) ? rawMarket : null;

  const inView = useMemo(() => inChain(data.assets, view.chain), [data.assets, view.chain]);
  const totals = useMemo(() => totalsOf(inView), [inView]);
  const series = useMemo(() => portfolioSeries(inView, market, view.range, data.readAt), [inView, market, view.range, data.readAt]);
  const shown = visibleAssets(data.assets, view, chainName);
  const unpriced = unpricedAssets(data.assets, view);
  const moves = visibleActivity(activity.items, view, chainName);

  const actionChain: ChainId = view.chain === "sol" || (view.chain === "all" && !accounts.rh && accounts.sol) ? "sol" : "rh";
  const swapHref = actionChain === "rh" ? "/swap?chain=rh" : "/swap";
  const connect = (chain: ChainId) => {
    setReceiving(null);
    setWalletsOpen(false);
    void wallet.connect(chain);
  };
  const exportCsv = () => {
    const labels = { asset: p.assets.asset, ticker: p.csv.ticker, network: p.csv.network, address: p.csv.address, quantity: p.assets.holdings, price: p.csv.price, value: p.csv.value, change: p.assets.change };
    downloadText(`tonkfun-portfolio-${new Date().toISOString().slice(0, 10)}.csv`, holdingsCsv(shown, labels, chainName), "text/csv;charset=utf-8");
  };
  const setChain = (chain: ChainView) => setParams({ chain: chain === "all" ? null : chain });
  const updated = data.readAt ? new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hour12: false }).format(data.readAt) : null;
  const filterButton = "flex min-h-[35px] items-center justify-center gap-[7px] rounded-[7px] border px-[11px] py-2 text-[12px] font-medium whitespace-nowrap max-[699px]:gap-1.5 max-[699px]:px-2 max-[699px]:text-[11px]";
  const empty = data.connected && !data.loading && !data.failed && data.assets.length === 0;
  const populated = data.connected && !data.loading && !data.failed && !empty;

  return (
    <div className="mx-auto flex w-full max-w-[1260px] min-w-0 flex-col gap-5 max-md:pb-3">
      <header className="flex flex-col">
        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold tracking-[1.7px] text-accent-text uppercase">
          <span aria-hidden="true" className="block h-px w-[22px] bg-accent" />
          {p.eyebrow}
        </div>
        <h1 className="font-display text-[35px] leading-[1.1] font-extrabold tracking-[-1.4px] max-[699px]:text-[29px] max-[699px]:tracking-[-1.2px]">{p.title}</h1>
        <p className="m-0 mt-2.5 text-[12px] text-text-3">{p.subtitle}</p>
      </header>

      {data.connected ? (
        <div className="flex items-center justify-between gap-2 md:gap-3.5">
          <div role="group" aria-label={p.filterLabel} className="flex min-w-0 gap-[5px] overflow-x-auto rounded-[10px] border border-line bg-bg-deep p-1 [scrollbar-width:none] max-[699px]:gap-0.5">
            <button type="button" aria-pressed={view.chain === "all"} onClick={() => setChain("all")} className={cn(filterButton, view.chain === "all" ? "border-line-strong bg-raised text-text" : "border-transparent text-text-3")}>
              <Layers size={14} strokeWidth={2} aria-hidden="true" />
              {p.allNetworks}
            </button>
            {(["rh", "sol"] as const).map((id) => (
              <button key={id} type="button" aria-pressed={view.chain === id} onClick={() => setChain(id)} className={cn(filterButton, view.chain === id ? "border-line-strong bg-raised text-text" : "border-transparent text-text-3")}>
                <ChainMark chain={id} size={16} decorative />
                {chainName(id)}
              </button>
            ))}
          </div>
          <div className="flex flex-none items-center gap-2 text-[11px] text-text-3">
            {updated ? (
              <span className="flex items-center gap-[7px] max-[699px]:hidden">
                <span aria-hidden="true" className="size-[5px] rounded-full bg-pos" />
                {fmt(p.updated, { time: updated })}
              </span>
            ) : null}
            <button type="button" onClick={data.refresh} aria-label={p.refresh} title={p.refresh} className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-raised hover:text-text">
              <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {!data.connected ? <ConnectState pending={data.walletPending} unavailable={phase === "unavailable"} onConnect={connect} /> : null}
      {data.loading ? <LoadingState /> : null}
      {data.failed ? <FailedState onRetry={data.refresh} /> : null}
      {empty ? <EmptyState onReceive={() => setReceiving(actionChain)} /> : null}

      {populated ? (
        <>
          {data.partial ? <p role="status" className="m-0 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-[12px] text-warn">{p.partial}</p> : null}
          <div className="flex flex-col gap-6 max-[699px]:gap-5">
            <div className="grid items-stretch gap-5 md:grid-cols-[minmax(0,1.8fr)_minmax(250px,1fr)] xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,1fr)] max-[699px]:contents">
              <BalanceCard totals={totals} series={series} range={view.range} onRange={(range) => setParams({ range: range === "1D" ? null : range })} hidden={hidden} onToggleHidden={toggleHidden} onExport={exportCsv} />
              <WalletOverview chains={data.chains} chain={view.chain} onChain={setChain} hidden={hidden} onReceive={() => setReceiving(actionChain)} onWallets={() => setWalletsOpen(true)} onConnect={connect} swapHref={swapHref} />
            </div>
            <HoldingsCard tab={view.tab} onTab={(tab) => setParams({ tab: tab === "assets" ? null : tab })} query={view.q} onQuery={(q) => setParams({ q: q || null })} count={shown.length}>
              {view.tab === "assets" ? (
                <AssetsPanel assets={shown} unpriced={unpriced} unpricedTotal={view.chain === "all" ? data.unpriced : (data.chains.find((chain) => chain.chain === view.chain)?.data?.unpriced ?? 0)} view={view} hidden={hidden} onSort={(sort) => setParams({ sort: sort === "value" ? null : sort })} onSmall={(hide) => setParams({ small: hide ? "hide" : null })} onReset={() => setParams({ q: null, chain: null, small: null, type: null })} onOpen={setAsset} />
              ) : (
                <ActivityPanel items={moves} type={view.type} loading={activity.loading} failed={activity.failed} hasMore={activity.hasMore} loadingMore={activity.loadingMore} loadedAt={activity.loadedAt} hidden={hidden} onType={(type) => setParams({ type: type === "all" ? null : type })} onLoadMore={activity.loadMore} onOpen={setActivityItem} />
              )}
            </HoldingsCard>
          </div>
          <Link href={href("/")} className="flex items-center gap-3 self-start rounded-lg max-[699px]:w-full max-[699px]:gap-2.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-[9px] bg-accent/7 text-accent-text">
              <Compass size={18} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span>
              <strong className="block text-[12px] font-semibold">{p.nudgeTitle}</strong>
              <small className="mt-[3px] block text-[11px] text-text-3">{p.nudgeBody}</small>
            </span>
            <ArrowUpRight size={14} strokeWidth={2} className="ml-3 flex-none text-text-3 max-[699px]:ml-auto" aria-hidden="true" />
          </Link>
        </>
      ) : null}

      {data.connected ? (
        <nav aria-label={p.dockLabel} className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-line-strong bg-surface/96 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
          <button type="button" aria-haspopup="dialog" onClick={() => setReceiving(actionChain)} className={cn(DOCK, DOCK_PLAIN)}>
            <ArrowDownLeft size={15} strokeWidth={2} aria-hidden="true" />
            {p.wallets.receive}
          </button>
          <Link href={href(swapHref)} className={cn(DOCK, "border-cta bg-cta font-semibold text-on-cta")}>
            <ArrowDownUp size={15} strokeWidth={2} aria-hidden="true" />
            {p.wallets.swap}
          </Link>
          <Link href={href("/bridge")} className={cn(DOCK, DOCK_PLAIN)}>
            <ArrowRightLeft size={15} strokeWidth={2} aria-hidden="true" />
            {p.wallets.bridge}
          </Link>
        </nav>
      ) : null}

      <ReceiveDialog open={receiving !== null} onClose={() => setReceiving(null)} accounts={accounts} chain={receiving ?? actionChain} onChain={setReceiving} onConnect={connect} />
      <WalletsDialog open={walletsOpen} onClose={() => setWalletsOpen(false)} accounts={accounts} onConnect={connect} />
      <AssetDialog asset={asset} hidden={hidden} onClose={() => setAsset(null)} />
      <ActivityDialog item={activityItem} hidden={hidden} loadedAt={activity.loadedAt} onClose={() => setActivityItem(null)} />
    </div>
  );
}
