"use client";

import { useCallback, useMemo } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ActionRequest, MissionJson, MissionPageJson, TradeSide } from "@/shared/tonk/mission";
import { explorerAddressUrl, type TonkNetwork } from "@/shared/tonk/networks";
import { ActivityCard } from "./components/activity/ActivityCard";
import { CreatorPanel } from "./components/curve/CreatorPanel";
import { CurveStatus } from "./components/curve/CurveStatus";
import { CurveTradePanel } from "./components/curve/CurveTradePanel";
import { MissionInsights } from "./components/curve/MissionInsights";
import { MissionTags } from "./components/curve/MissionTags";
import { RewardsCard } from "./components/curve/RewardsCard";
import { UnpaidEth } from "./components/curve/UnpaidEth";
import { MarketCard } from "./components/MarketCard";
import { tradeTokenOf } from "./components/TokenAside";
import { TokenBreadcrumb } from "./components/TokenBreadcrumb";
import { TokenHeader } from "./components/TokenHeader";
import { TradeDock } from "./components/trade/TradeDock";
import { useAction } from "./hooks/useAction";
import { useMissionAccount } from "./hooks/useMissionAccount";
import { useSentTrade } from "./hooks/useSentTrade";
import { missionDetail } from "./lib/mission-detail";
import { coinAmount } from "./lib/money";

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
 * 2's layout with every figure from the chain, Buy and Sell on the curve,
 * the holder's reward claim, and the creator's tools for the wallet that
 * launched it. Phones trade from the bottom bar.
 */
export function MissionView({ page, network, onMission, onRefresh }: MissionViewProps) {
  const { t } = useI18n();
  const { mission } = page;
  const detail = useMemo(() => missionDetail(page, network), [page, network]);
  const view = useMissionAccount(mission.token);
  const { owner, account, refresh: refreshAccount } = view;
  // Whatever confirms (a trade, a claim, an edit), the page and the wallet's standing are read again.
  const refreshAll = useCallback(() => {
    onRefresh();
    refreshAccount();
  }, [onRefresh, refreshAccount]);
  const { sent, send, dismiss } = useSentTrade(refreshAll);
  const { state: action, start, reset: stopWatching } = useAction(refreshAll);
  const onAction = useCallback((request: ActionRequest) => void start(request), [start]);
  const isCreator = owner !== null && owner.toLowerCase() === mission.creator.toLowerCase();
  const later = t.launch.testnet.laterTitle;
  const panel = (side: TradeSide, close?: () => void) => (
    <CurveTradePanel key={side} mission={mission} network={network} view={view} sent={sent} onSent={send} onDismiss={dismiss} onMission={onMission} initialSide={side} onClose={close} />
  );
  return (
    <div className="flex w-full min-w-0 flex-col gap-5 max-md:gap-4 max-md:pb-2">
      <TokenBreadcrumb name={mission.name} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_336px] xl:grid-cols-[minmax(0,1fr)_360px] max-lg:gap-5">
        <div className="flex min-w-0 flex-col gap-5 max-md:gap-4">
          <TokenHeader detail={detail} explorerUrl={explorerAddressUrl(network, mission.token)} tags={<MissionTags agent={detail.token.flags.agent} graduated={mission.graduated} />} />
          {owner ? <UnpaidEth amount={BigInt(account?.unpaidEth ?? "0")} owner={owner} network={network} action={action} onAction={onAction} onStop={stopWatching} /> : null}
          {isCreator && owner ? <CreatorPanel mission={mission} network={network} owner={owner} action={action} onAction={onAction} onStop={stopWatching} /> : null}
          <MarketCard detail={detail} />
          <ActivityCard detail={detail} empty={{ trades: t.mission.noTrades, holders: later, traders: later }} />
          <MissionInsights mission={mission} score={detail.token.score} level={detail.token.level} network={network} />
        </div>
        <aside aria-label={t.token.aside} className="min-w-0 lg:sticky lg:top-6">
          <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-1", mission.crewBps === 0 && "md:grid-cols-1")}>
            <div className="max-md:hidden">{panel("buy")}</div>
            {mission.crewBps > 0 ? <RewardsCard mission={mission} network={network} view={view} action={action} onAction={onAction} onStop={stopWatching} /> : null}
          </div>
        </aside>
      </div>
      <TradeDock
        token={tradeTokenOf(detail)}
        live
        price={coinAmount(detail.priceUsd ?? 0)}
        unit={network.unit}
        panel={panel}
        notice={sent ? <CurveStatus sent={sent} token={mission.token} ticker={mission.symbol} network={network} onDismiss={dismiss} /> : null}
      />
    </div>
  );
}
