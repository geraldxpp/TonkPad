"use client";

import { useCallback, useMemo } from "react";
import { useShellLive } from "@/modules/shell/live/ShellLive";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { tokenPrice } from "@/shared/tonk/curve";
import { type ActionRequest, canSell, type MissionJson, type MissionPageJson, type TradeSide } from "@/shared/tonk/mission";
import { explorerAddressUrl, isTestnetSite, LAUNCHPAD_AUDITED, type TonkNetwork } from "@/shared/tonk/networks";
import { BetaNotice } from "@/shared/ui/BetaNotice";
import { ActivityCard } from "./components/activity/ActivityCard";
import { CreatorPanel } from "./components/curve/CreatorPanel";
import { CurveStatus } from "./components/curve/CurveStatus";
import { CurveTradePanel } from "./components/curve/CurveTradePanel";
import { PoolTradePanel } from "./components/curve/PoolTradePanel";
import { MissionInsights, type Top10 } from "./components/curve/MissionInsights";
import { MissionTags } from "./components/curve/MissionTags";
import { PoolFees } from "./components/curve/PoolFees";
import { RewardsCard } from "./components/curve/RewardsCard";
import { UnpaidEth } from "./components/curve/UnpaidEth";
import { MarketCard } from "./components/MarketCard";
import { tradeTokenOf } from "./components/TokenAside";
import { TokenBreadcrumb } from "./components/TokenBreadcrumb";
import { TokenHeader } from "./components/TokenHeader";
import { TradeDock } from "./components/trade/TradeDock";
import { useAction } from "./hooks/useAction";
import { useIndexer } from "./hooks/useIndexer";
import { useMissionAccount } from "./hooks/useMissionAccount";
import { useSentTrade } from "./hooks/useSentTrade";
import { withIndexer } from "./lib/indexer";
import { missionDetail } from "./lib/mission-detail";
import { coinAmount, MONEY_UNIT } from "./lib/money";

interface MissionViewProps {
  page: MissionPageJson;
  network: TonkNetwork;
  /** The server read newer state while checking a trade: the page takes it at once. */
  onMission: (mission: MissionJson) => void;
  /** Reads the chain again: after something of the visitor's is confirmed. */
  onRefresh: () => void;
}

/**
 * The token screen for a mission read from tonkfun.fun's launchpad: module
 * 2's layout with every figure from the chain, Buy and Sell on the curve
 * (on its Uniswap pool once graduated, with Share pool fees), the holder's
 * reward claim, and the creator's tools for the wallet that launched it.
 * Phones trade from the bottom bar.
 */
export function MissionView({ page, network, onMission, onRefresh }: MissionViewProps) {
  const { t } = useI18n();
  const { mission } = page;
  const shell = useShellLive();
  // The testnet site counts in test ETH; mainnet in dollars at the live ETH price, and as unavailable until there is one.
  const usdPerCoin = MONEY_UNIT ? undefined : (shell.data?.status.ethUsd ?? null);
  // Holders, top traders and the top-10 share come from the live-data worker on mainnet; the testnet site has no indexer yet.
  const testnet = isTestnetSite();
  const indexer = useIndexer(mission.token, !testnet);
  const detail = useMemo(() => withIndexer(missionDetail(page, network, usdPerCoin), indexer), [page, network, usdPerCoin, indexer]);
  const view = useMissionAccount(mission.token);
  const { owner, account, refresh: refreshAccount } = view;
  // Whatever confirms (a trade, a claim, an edit), the page and the wallet's standing are read again.
  const refreshAll = useCallback(() => {
    onRefresh();
    refreshAccount();
  }, [onRefresh, refreshAccount]);
  const { sent, send, dismiss } = useSentTrade(refreshAll);
  const { state: action, start, reset: stopWatching } = useAction(refreshAll, { token: mission.token, owner });
  const onAction = useCallback((request: ActionRequest) => void start(request), [start]);
  const isCreator = owner !== null && owner.toLowerCase() === mission.creator.toLowerCase();
  // Why the holders or traders list is empty: not on testnet yet; on mainnet, still loading or the worker can't be reached.
  const indexerNote = testnet ? t.launch.testnet.laterTitle : indexer.status === "loading" ? t.token.live.loading : t.token.live.unavailable;
  const notes = {
    trades: t.mission.noTrades,
    holders: indexer.status === "ok" ? t.token.live.emptyHolders : indexerNote,
    // Top traders are in dollars: without the ETH price there are none to show, even with trades.
    traders: indexer.status === "ok" ? (usdPerCoin === null ? t.token.live.unavailable : t.mission.noTrades) : indexerNote,
  };
  const top10: Top10 = testnet ? "later" : indexer.status === "ok" ? (indexer.top10Share === null ? "unavailable" : { share: indexer.top10Share }) : indexer.status;
  // Once graduated, trading moves to the token's Uniswap pool where this network has Uniswap's router.
  const pool = mission.graduated && network.uniswap !== null;
  // The launchpad's pause holds buys and sells on the curve only; a graduated pool trades on.
  const curvePaused = mission.paused && !mission.graduated;
  const panel = (side: TradeSide, close?: () => void) =>
    pool ? (
      <PoolTradePanel key={side} mission={mission} network={network} view={view} sent={sent} onSent={send} onDismiss={dismiss} initialSide={side} onClose={close} />
    ) : (
      <CurveTradePanel key={side} mission={mission} network={network} view={view} sent={sent} onSent={send} onDismiss={dismiss} onMission={onMission} initialSide={side} onClose={close} />
    );
  return (
    <div className="flex w-full min-w-0 flex-col gap-5 max-md:gap-4 max-md:pb-2">
      {!isTestnetSite() && !LAUNCHPAD_AUDITED ? <BetaNotice text={t.launch.beta} /> : null}
      {curvePaused ? <BetaNotice text={canSell(mission) ? t.mission.pausedNoticeSells : t.mission.pausedNotice} /> : null}
      <TokenBreadcrumb name={mission.name} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_336px] xl:grid-cols-[minmax(0,1fr)_360px] max-lg:gap-5">
        <div className="flex min-w-0 flex-col gap-5 max-md:gap-4">
          <TokenHeader detail={detail} explorerUrl={explorerAddressUrl(network, mission.token)} tags={<MissionTags agent={detail.token.flags.agent} graduated={mission.graduated} />} />
          {owner ? <UnpaidEth amount={BigInt(account?.unpaidEth ?? "0")} owner={owner} network={network} action={action} onAction={onAction} onStop={stopWatching} /> : null}
          {isCreator && owner ? <CreatorPanel mission={mission} network={network} owner={owner} action={action} onAction={onAction} onStop={stopWatching} /> : null}
          <MarketCard detail={detail} />
          <ActivityCard detail={detail} empty={notes} />
          <MissionInsights mission={mission} score={detail.token.score} level={detail.token.level} network={network} top10={top10} />
        </div>
        <aside aria-label={t.token.aside} className="min-w-0 lg:sticky lg:top-6">
          <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-1", mission.crewBps === 0 && "md:grid-cols-1")}>
            <div className="max-md:hidden">{panel("buy")}</div>
            {mission.crewBps > 0 ? <RewardsCard mission={mission} network={network} view={view} action={action} onAction={onAction} onStop={stopWatching} /> : null}
            {pool ? <PoolFees mission={mission} network={network} owner={owner} action={action} onAction={onAction} onStop={stopWatching} /> : null}
          </div>
        </aside>
      </div>
      <TradeDock
        token={tradeTokenOf(detail)}
        live
        price={coinAmount(tokenPrice(BigInt(mission.virtualEth), BigInt(mission.virtualTokens)))}
        unit={network.unit}
        panel={panel}
        paused={curvePaused ? (canSell(mission) ? t.mission.trade.buyPaused : t.mission.trade.paused) : undefined}
        notice={sent ? <CurveStatus sent={sent} token={mission.token} ticker={mission.symbol} network={network} pool={mission.pool ?? null} onDismiss={dismiss} /> : null}
      />
    </div>
  );
}
