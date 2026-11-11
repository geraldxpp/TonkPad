"use client";

import { Layers, Leaf, type LucideIcon, ShieldCheck, Zap } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import type { BridgeRoute } from "../lib/types";
import { chosenRoute, etaText, rankRoutes, totalCost } from "../lib/view";

interface RoutesCardProps {
  routes: readonly BridgeRoute[];
  picked: string | null;
  loading: boolean;
  /** There's an amount to compare routes for. */
  active: boolean;
  onPick: (id: string) => void;
}

const cost = (value: number | null) => (value === null ? "—" : value > 0 && value < 0.01 ? "<$0.01" : formatUsd(value));

/** "Pick your pace.": every live route, marked fastest, cheapest or secured by the chain itself. */
export function RoutesCard({ routes, picked, loading, active, onPick }: RoutesCardProps) {
  const { t } = useI18n();
  const b = t.bridge;
  const r = b.routes;
  const { suggested, fastest, cheapest } = rankRoutes(routes);
  const chosen = chosenRoute(routes, picked);
  const describe = (route: BridgeRoute): { title: string; Icon: LucideIcon } => {
    if (route.trustless) return { title: r.direct, Icon: ShieldCheck };
    if (route.id === fastest?.id && route.id === cheapest?.id) return { title: r.best, Icon: Zap };
    if (route.id === fastest?.id) return { title: r.fastest, Icon: Zap };
    if (route.id === cheapest?.id) return { title: r.lower, Icon: Leaf };
    return { title: route.name, Icon: Layers };
  };
  return (
    <section aria-labelledby="routes-title" className="rounded-2xl border border-line bg-surface p-5 max-[999px]:p-[18px]">
      <div className="mb-[18px] flex items-baseline justify-between gap-2.5">
        <h2 id="routes-title" tabIndex={-1} className="scroll-mt-[90px] font-display text-[18px] font-bold tracking-[-0.3px]">
          {r.title}
        </h2>
        <span className="text-[10px] text-text-3">{r.live}</span>
      </div>
      {routes.length ? (
        <div role="radiogroup" aria-labelledby="routes-title">
          {routes.map((route) => {
            const { title, Icon } = describe(route);
            const on = route.id === chosen?.id;
            return (
              <label key={route.id} className={cn("relative mt-2 flex cursor-pointer items-center gap-2.5 rounded-[9px] border bg-bg px-[11px] py-[13px] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-[3px] has-[input:focus-visible]:outline-cta", on ? "border-accent/55 bg-accent/4" : "border-line")}>
                <input type="radio" name="bridge-route" value={route.id} checked={on} onChange={() => onPick(route.id)} className="absolute inset-0 m-0 size-full cursor-pointer opacity-0" />
                <span className={cn("flex size-7 flex-none items-center justify-center rounded-[7px]", on ? "bg-accent/8 text-accent-text" : "bg-raised text-text-3")}>
                  <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="flex flex-wrap items-center gap-x-[7px] gap-y-0.5 text-[12px] font-semibold">
                    {title}
                    {route.id === suggested?.id ? <span className="rounded-[3px] border border-accent/18 bg-accent/5 px-1 py-0.5 text-[9px] font-normal text-accent-text">{r.suggested}</span> : null}
                  </strong>
                  <small className="mt-1 block truncate font-mono text-[10px] text-text-3">{title === route.name ? etaText(b, route.etaSeconds) : fmt(r.detail, { eta: etaText(b, route.etaSeconds), name: route.name })}</small>
                </span>
                <span className="flex flex-none flex-col items-end gap-1">
                  <strong className="font-mono text-[12px] font-medium">{cost(totalCost(route))}</strong>
                  <small className="text-[9px] text-text-3">{r.totalFee}</small>
                </span>
                <span aria-hidden="true" className={cn("ml-px flex size-[13px] flex-none items-center justify-center rounded-full border", on ? "border-accent" : "border-line-strong")}>
                  {on ? <span className="size-[5px] rounded-full bg-accent" /> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p aria-busy={loading || undefined} className="m-0 rounded-[9px] border border-dashed border-line px-3 py-6 text-center text-[11px] text-text-3">
          {loading ? b.action.finding : active ? r.none : r.empty}
        </p>
      )}
      <p className="m-0 mt-[13px] text-center text-[10px] text-text-3">{r.caption}</p>
    </section>
  );
}
