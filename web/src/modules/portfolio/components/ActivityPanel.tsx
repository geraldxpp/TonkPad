"use client";

import { ArrowDownLeft, ArrowDownUp, ArrowUpRight, ChevronDown, Clock3, LoaderCircle, type LucideIcon } from "lucide-react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { formatQuantity, MASK } from "../lib/format";
import type { ActivityLeg, ActivityType, PortfolioActivity } from "../lib/types";
import { ACTIVITY_FILTERS, type ActivityFilter } from "../lib/view";

const ICONS: Record<ActivityType, LucideIcon> = { swap: ArrowDownUp, receive: ArrowDownLeft, send: ArrowUpRight };

const leg = (item: ActivityLeg | undefined, sign: string) => (item ? `${sign}${formatQuantity(item.amount)} ${item.symbol}` : "");

/** "Swapped ETH for GHOST", "Received USDC", "Sent USDC". */
export function activityTitle(t: Dictionary, item: PortfolioActivity): string {
  const a = t.portfolio.activity;
  if (item.failed) return a.failedTitle;
  if (item.type === "swap") return fmt(a.swapped, { from: item.sent[0]?.symbol ?? "", to: item.received[0]?.symbol ?? "" });
  return fmt(item.type === "receive" ? a.received : a.sent, { symbol: (item.type === "receive" ? item.received[0] : item.sent[0])?.symbol ?? "" });
}

/** The big line: what came in, or what went out when nothing came in. */
export const activityAmount = (item: PortfolioActivity) => (item.received[0] ? leg(item.received[0], "+") : leg(item.sent[0], "−"));

/** The small line: what it cost, or who it went to or came from. */
export function activityDetail(t: Dictionary, item: PortfolioActivity): string {
  const a = t.portfolio.activity;
  if (item.type === "swap") return leg(item.sent[0], "−");
  if (!item.counterparty) return "";
  return fmt(item.type === "receive" ? a.from : a.to, { address: shortAddress(item.counterparty) });
}

/** "Today, 12:42", "Yesterday, 09:36", "Nov 7, 15:21", in the visitor's own time. */
export function activityWhen(t: Dictionary, lang: string, time: number, now: number): string {
  const clock = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hour12: false }).format(time);
  const dayOf = (value: number) => new Date(value).toDateString();
  const day = now && dayOf(time) === dayOf(now) ? t.portfolio.activity.today : now && dayOf(time) === dayOf(now - 86_400_000) ? t.portfolio.activity.yesterday : new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(time);
  return `${day}, ${clock}`;
}

interface ActivityPanelProps {
  items: readonly PortfolioActivity[];
  type: ActivityFilter;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadedAt: number;
  hidden: boolean;
  onType: (type: ActivityFilter) => void;
  onLoadMore: () => void;
  onOpen: (item: PortfolioActivity) => void;
}

/** "A record of your moves": swaps, receipts and sends read from the chains, newest first. */
export function ActivityPanel({ items, type, loading, failed, hasMore, loadingMore, loadedAt, hidden, onType, onLoadMore, onOpen }: ActivityPanelProps) {
  const { t, lang } = useI18n();
  const a = t.portfolio.activity;
  const labels: Record<ActivityFilter, string> = { all: a.typeAll, swap: a.typeSwap, receive: a.typeReceive, send: a.typeSend };
  const mask = (text: string) => (hidden ? MASK : text);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5 max-[699px]:px-[17px]">
        <span className="text-[11px] text-text-3">{a.sub}</span>
        <label className="relative flex items-center rounded-md border border-line bg-bg">
          <span className="sr-only">{a.typeLabel}</span>
          <select value={type} onChange={(event) => onType(event.target.value as ActivityFilter)} className="max-w-full cursor-pointer appearance-none bg-transparent py-2 pr-7 pl-2.5 text-[11px] text-text-2">
            {ACTIVITY_FILTERS.map((filter) => (
              <option key={filter} value={filter} className="bg-surface text-text">
                {labels[filter]}
              </option>
            ))}
          </select>
          <ChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-[9px] text-text-3" aria-hidden="true" />
        </label>
      </div>
      {failed ? <p role="status" className="m-0 border-b border-line bg-warn/6 px-6 py-2.5 text-[11px] text-warn max-[699px]:px-[17px]">{a.error}</p> : null}
      {loading ? (
        <p role="status" className="m-0 flex items-center justify-center gap-2 px-5 py-[50px] text-[12px] text-text-3">
          <LoaderCircle size={15} strokeWidth={2} className="tk-spin" aria-hidden="true" />
          {a.loading}
        </p>
      ) : items.length === 0 ? (
        <div className="px-5 py-[50px] text-center">
          <Clock3 size={26} strokeWidth={1.7} className="mx-auto mb-[15px] text-text-3" aria-hidden="true" />
          <h3 className="font-display text-[20px] font-bold">{a.noneTitle}</h3>
          <p className="m-0 mt-2 text-[12px] text-text-3">{a.noneBody}</p>
        </div>
      ) : (
        <ol className="m-0 list-none p-0">
          {items.map((item) => {
            const Icon = ICONS[item.type];
            const detail = activityDetail(t, item);
            return (
              <li key={`${item.chain}:${item.id}`} className="border-t border-line first:border-t-0">
                <button type="button" aria-haspopup="dialog" onClick={() => onOpen(item)} className="flex w-full items-center gap-3.5 px-6 py-[19px] text-left hover:bg-raised max-[699px]:flex-wrap max-[699px]:gap-2.5 max-[699px]:p-4">
                  <span className="flex size-[38px] flex-none items-center justify-center rounded-[10px] border border-line bg-raised text-accent-text max-[699px]:size-8 max-[699px]:rounded-lg">
                    <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 max-[699px]:min-w-[calc(100%-42px)]">
                    <strong className="block truncate text-[12px] font-semibold">{activityTitle(t, item)}</strong>
                    <small className="mt-[5px] block text-[11px] text-text-3">
                      {CHAINS[item.chain].name} · {activityWhen(t, lang, item.time, loadedAt)}
                    </small>
                  </span>
                  <span className="flex flex-col gap-[5px] text-right max-[699px]:flex-1 max-[699px]:items-start max-[699px]:pl-[42px] max-[699px]:text-left">
                    <strong className={cn("font-mono text-[12px] font-medium", item.received[0] && !item.failed && !hidden && "text-pos")}>{mask(activityAmount(item) || "—")}</strong>
                    {detail ? <small className="font-mono text-[10px] text-text-3">{mask(detail)}</small> : null}
                  </span>
                  <span className={cn("ml-5 rounded px-[7px] py-1 text-[10px] max-[699px]:ml-0", item.failed ? "bg-neg/8 text-neg" : "bg-pos/8 text-pos")}>{item.failed ? a.failed : a.completed}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {hasMore && !loading ? (
        <div className="border-t border-line p-3 text-center">
          <button type="button" disabled={loadingMore} onClick={onLoadMore} className="min-h-9 rounded-lg px-4 text-[12px] font-semibold text-accent-text hover:bg-raised disabled:cursor-wait disabled:opacity-60">
            {loadingMore ? a.loading : a.loadMore}
          </button>
        </div>
      ) : null}
      <div className="flex justify-between gap-2.5 border-t border-line px-6 py-[13px] text-[10px] text-text-3 max-[699px]:px-[17px]">
        <span>{a.footSource}</span>
        <span className="text-right">{a.footTime}</span>
      </div>
    </div>
  );
}
