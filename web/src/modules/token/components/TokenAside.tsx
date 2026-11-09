"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import type { TokenDetail } from "@/shared/types/token-detail";
import { formatDay } from "../lib/format";
import { AgentChat } from "./mission/AgentChat";
import { MissionTelemetry } from "./mission/MissionTelemetry";
import { TradePanel } from "./trade/TradePanel";

/** The right column: trade, mission telemetry and the token's agent (when it has one). */
export function TokenAside({ detail }: { detail: TokenDetail }) {
  const { t, lang } = useI18n();
  const { token, devLock, crew, agent } = detail;
  const live = detail.source === "live";
  const curvePct = token.curve < 1 ? Math.round(token.curve * 100) : null;
  return (
    <aside aria-label={t.token.aside} className="flex min-w-0 max-w-[420px] flex-[1_1_360px] flex-col gap-5 max-md:max-w-none">
      <TradePanel
        live={live}
        token={{
          name: token.name,
          ticker: token.ticker,
          art: token.art,
          chain: token.chain,
          launchpad: token.launchpad,
          onCurve: curvePct !== null,
          priceUsd: detail.priceUsd ?? 0,
          nativeUsd: detail.nativeUsd ?? 0,
          feePct: detail.feePct,
          crewPct: crew?.sharePct ?? null,
        }}
      />
      <MissionTelemetry devLock={devLock} crew={crew} live={live} />
      {agent && !live && detail.priceUsd !== null ? (
        <AgentChat
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
    </aside>
  );
}
