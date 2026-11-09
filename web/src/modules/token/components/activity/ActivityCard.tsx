"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatInteger } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { Tabs } from "@/shared/ui/Tabs";
import { coinOf } from "../../lib/format";
import { HoldersTable } from "./HoldersTable";
import { TradersTable } from "./TradersTable";
import { TradesTable } from "./TradesTable";

const TABS = ["trades", "holders", "traders"] as const;
type ActivityTab = (typeof TABS)[number];

/** Rows each tab shows before "Show more", as in the export. */
const FIRST: Record<ActivityTab, number> = { trades: 8, holders: 6, traders: 5 };

const parseTab = (raw: string | null): ActivityTab => TABS.find((tab) => tab === raw) ?? "trades";

type ActivityData = Pick<TokenDetail, "token" | "flow1h" | "trades" | "holders" | "topTraders" | "source">;

/** Live trades, holders and top traders (the tab is kept in the URL), the last hour's buys against sells, and Show more. */
export function ActivityCard({ detail }: { detail: ActivityData }) {
  const { t } = useI18n();
  const a = t.token.activity;
  const { params, setParams } = useUrlParams();
  const tab = parseTab(params.get("tab"));
  const [expanded, setExpanded] = useState<ActivityTab | null>(null);
  const { token, flow1h } = detail;

  const rows = { trades: detail.trades.length, holders: detail.holders.length, traders: detail.topTraders.length }[tab];
  const open = expanded === tab;
  const limit = open ? rows : FIRST[tab];
  const flowTotal = flow1h ? flow1h.buys + flow1h.sells : 0;
  const buyShare = flow1h && flowTotal > 0 ? (flow1h.buys / flowTotal) * 100 : 50;
  const holdersLabel = fmt(a.holders, { count: token.holders === null ? "—" : formatInteger(token.holders) });
  const empty = detail.source === "live" && rows === 0;
  const emptyText = { trades: t.token.live.emptyTrades, holders: t.token.live.emptyHolders, traders: t.token.live.emptyTraders }[tab];
  return (
    <section aria-label={a.label} className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        <Tabs
          size="panel"
          label={a.label}
          panelId="activity-panel"
          idPrefix="activity"
          value={tab}
          onChange={(next) => setParams({ tab: next === "trades" ? null : next })}
          tabs={[
            { id: "trades", label: a.trades },
            { id: "holders", label: holdersLabel },
            { id: "traders", label: a.traders },
          ]}
        />
        <span className="flex-auto" />
        <span title={a.flow} className="inline-flex items-center gap-2 font-mono text-[12px] font-semibold">
          <span className="font-sans font-normal text-text-3">{a.hour}</span>
          {flow1h ? (
            <>
              <span className="text-pos">{fmt(a.buys, { count: formatInteger(flow1h.buys) })}</span>
              <span aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-[3px] bg-neg">
                <span className="block h-full bg-pos" style={{ width: `${buyShare}%` }} />
              </span>
              <span className="text-neg">{fmt(a.sells, { count: formatInteger(flow1h.sells) })}</span>
            </>
          ) : <span className="font-sans font-normal text-text-3">{t.token.live.unavailable}</span>}
        </span>
      </div>
      <div id="activity-panel" role="tabpanel" aria-labelledby={`activity-${tab}`} className="overflow-x-auto">
        {empty ? <p className="px-5 py-10 text-center text-[13px] text-text-3">{emptyText}</p> : null}
        {!empty && tab === "trades" ? <TradesTable trades={detail.trades.slice(0, limit)} coin={coinOf(token.chain)} ticker={token.ticker} /> : null}
        {!empty && tab === "holders" ? <HoldersTable holders={detail.holders.slice(0, limit)} ticker={token.ticker} /> : null}
        {!empty && tab === "traders" ? <TradersTable traders={detail.topTraders.slice(0, limit)} /> : null}
      </div>
      {rows > FIRST[tab] ? (
        <div className="flex justify-center pt-2 pb-3">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="activity-panel"
            onClick={() => setExpanded(open ? null : tab)}
            className="inline-flex h-9 items-center gap-1 rounded-[10px] px-3 text-[14px] text-text-2 hover:text-text"
          >
            {open ? a.showLess : a.showMore}
            {open ? <ChevronUp size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />}
          </button>
        </div>
      ) : (
        <div className="h-3" />
      )}
    </section>
  );
}
