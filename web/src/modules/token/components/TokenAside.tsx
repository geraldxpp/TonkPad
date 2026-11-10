"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { TokenDetail } from "@/shared/types/token-detail";
import { formatDay } from "../lib/format";
import { AgentLauncher } from "./mission/AgentLauncher";
import { CrewCard } from "./mission/CrewCard";
import { LiveTradePanel } from "./trade/LiveTradePanel";
import { TradePanel } from "./trade/TradePanel";
import type { TradeToken } from "./trade/types";

/** What the trade form needs from the token's detail. */
export function tradeTokenOf(detail: TokenDetail): TradeToken {
  const { token, crew } = detail;
  return {
    address: detail.contract,
    name: token.name,
    ticker: token.ticker,
    art: token.art,
    chain: token.chain,
    launchpad: token.launchpad,
    onCurve: token.curve < 1,
    priceUsd: detail.priceUsd ?? 0,
    nativeUsd: detail.nativeUsd ?? 0,
    feePct: detail.feePct,
    crewPct: crew?.sharePct ?? null,
  };
}

/**
 * The right column, sticky from 1024 px: the trade form, crew rewards and the
 * token's agent. Phones trade from the bottom bar instead, so the form stays
 * out of the column there; tablets set the cards side by side under the page.
 */
export function TokenAside({ detail }: { detail: TokenDetail }) {
  const { t, lang } = useI18n();
  const { token, devLock, crew, agent } = detail;
  const live = detail.source === "live";
  const trade = tradeTokenOf(detail);
  const curvePct = token.curve < 1 ? Math.round(token.curve * 100) : null;
  const showAgent = agent !== null && !live && detail.priceUsd !== null;
  return (
    <aside aria-label={t.token.aside} className="min-w-0 lg:sticky lg:top-6">
      <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-1", !crew && !showAgent && "md:grid-cols-1")}>
        <div className="max-md:hidden md:row-span-2 lg:row-span-1">{live ? <LiveTradePanel token={trade} /> : <TradePanel token={trade} />}</div>
        {crew ? <CrewCard crew={crew} /> : null}
        {showAgent && agent && detail.priceUsd !== null ? (
          <AgentLauncher
            agent={agent.name}
            art={token.art}
            ticker={token.ticker}
            facts={{
              name: token.name,
              curvePct,
              holders: token.holders,
              priceUsd: detail.priceUsd,
              devLock,
              crew,
              lockStarted: devLock ? formatDay(devLock.startedAt, lang) : "",
            }}
          />
        ) : null}
      </div>
    </aside>
  );
}
