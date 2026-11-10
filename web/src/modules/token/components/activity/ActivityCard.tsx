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
import { AboutCard } from "../AboutCard";
import { HoldersTable } from "./HoldersTable";
import { TradersTable } from "./TradersTable";
import { TradesTable } from "./TradesTable";

const TABS = ["trades", "holders", "traders", "about"] as const;
type ActivityTab = (typeof TABS)[number];
type ListTab = Exclude<ActivityTab, "about">;

/** Rows each list shows before "Show more". */
const FIRST: Record<ListTab, number> = { trades: 8, holders: 6, traders: 5 };

const parseTab = (raw: string | null): ActivityTab => TABS.find((tab) => tab === raw) ?? "trades";

/** The last hour's buys against sells, above the trades. */
function FlowSummary({ flow }: { flow: TokenDetail["flow1h"] }) {
  const { t } = useI18n();
  const a = t.token.activity;
  if (!flow) {
    return <p className="border-b border-line px-5 py-3.5 text-[11px] text-text-3 max-md:px-3.5">{t.token.live.unavailable}</p>;
  }
  const total = flow.buys + flow.sells;
  const buyShare = total > 0 ? (flow.buys / total) * 100 : 50;
  return (
    <div title={a.flow} className="flex items-center gap-3 border-b border-line px-5 py-3.5 text-[11px] text-text-3 max-md:gap-2 max-md:px-3.5">
      <span aria-hidden="true" className="size-[5px] flex-none rounded-full bg-pos" />
      <span className="flex-none font-mono font-medium text-pos">{fmt(a.buys, { count: formatInteger(flow.buys) })}</span>
      <span aria-hidden="true" className="h-[3px] min-w-6 flex-1 overflow-hidden rounded-full bg-neg/55">
        <span className="block h-full rounded-full bg-pos" style={{ width: `${buyShare}%` }} />
      </span>
      <span className="flex-none font-mono font-medium text-neg">{fmt(a.sells, { count: formatInteger(flow.sells) })}</span>
      <span aria-hidden="true" className="size-[5px] flex-none rounded-full bg-neg" />
      <span className="flex-none">{a.hour}</span>
    </div>
  );
}

/**
 * Live trades (with the last hour's flow), holders, top traders and About, in
 * underlined tabs kept in the URL; long lists open with Show more. `empty`
 * lets a page say in its own words why one of its lists has nothing in it.
 */
export function ActivityCard({ detail, empty: emptyNotes }: { detail: TokenDetail; empty?: Partial<Record<ListTab, string>> }) {
  const { t } = useI18n();
  const a = t.token.activity;
  const { params, setParams } = useUrlParams();
  const tab = parseTab(params.get("tab"));
  const [expanded, setExpanded] = useState<ActivityTab | null>(null);
  const { token } = detail;

  const rows = tab === "about" ? 0 : { trades: detail.trades.length, holders: detail.holders.length, traders: detail.topTraders.length }[tab];
  const open = expanded === tab;
  const limit = tab === "about" ? 0 : open ? rows : FIRST[tab];
  const holdersLabel = fmt(a.holders, { count: token.holders === null ? "—" : formatInteger(token.holders) });
  const empty = tab !== "about" && detail.source === "live" && rows === 0;
  const emptyText = tab === "about" ? "" : (emptyNotes?.[tab] ?? { trades: t.token.live.emptyTrades, holders: t.token.live.emptyHolders, traders: t.token.live.emptyTraders }[tab]);
  return (
    <section aria-label={a.label} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex min-w-0 items-center border-b border-line px-4 max-md:px-2">
        <Tabs
          size="underline"
          label={a.label}
          panelId="activity-panel"
          idPrefix="activity"
          value={tab}
          onChange={(next) => setParams({ tab: next === "trades" ? null : next })}
          className="min-w-0 flex-1"
          tabs={[
            { id: "trades", label: a.trades },
            { id: "holders", label: holdersLabel },
            { id: "traders", label: a.traders },
            { id: "about", label: a.about },
          ]}
        />
      </div>
      <div id="activity-panel" role="tabpanel" aria-labelledby={`activity-${tab}`} className="overflow-x-auto">
        {tab === "trades" ? <FlowSummary flow={detail.flow1h} /> : null}
        {empty ? <p className="px-5 py-10 text-center text-[13px] text-text-3">{emptyText}</p> : null}
        {!empty && tab === "trades" ? <TradesTable trades={detail.trades.slice(0, limit)} coin={coinOf(token.chain)} ticker={token.ticker} /> : null}
        {!empty && tab === "holders" ? <HoldersTable holders={detail.holders.slice(0, limit)} ticker={token.ticker} /> : null}
        {!empty && tab === "traders" ? <TradersTable traders={detail.topTraders.slice(0, limit)} /> : null}
        {tab === "about" ? <AboutCard detail={detail} /> : null}
      </div>
      {tab !== "about" && rows > FIRST[tab] ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="activity-panel"
          onClick={() => setExpanded(open ? null : tab)}
          className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-line text-[12px] text-text-3 hover:bg-raised/50 hover:text-text focus-visible:[outline-offset:-2px]"
        >
          {open ? a.showLess : a.showMore}
          {open ? <ChevronUp size={14} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />}
        </button>
      ) : null}
    </section>
  );
}
