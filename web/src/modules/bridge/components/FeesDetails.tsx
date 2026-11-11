"use client";

import { ChevronDown } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatUsd } from "@/shared/lib/format";
import type { BridgeAsset } from "../lib/networks";
import type { BridgeRoute } from "../lib/types";
import { amountOut, totalCost } from "../lib/view";

const usd = (value: number | null) => (value === null ? "—" : value > 0 && value < 0.01 ? "<$0.01" : formatUsd(value));

/** "Total fees": the route's own cost, the source network's, any gas delivered, and the least that can arrive. */
export function FeesDetails({ route, receive }: { route: BridgeRoute | null; receive: BridgeAsset }) {
  const { t } = useI18n();
  const f = t.bridge.fees;
  const rows: [string, string][] = route
    ? [
        [f.route, usd(route.feeUsd)],
        [f.network, usd(route.networkUsd)],
        [f.gas, route.gasTopUp ? usd(route.gasTopUp.usd) : f.off],
        [f.minimum, `${amountOut(route.minOut, receive)} ${receive.symbol}`],
      ]
    : [];
  return (
    <details className="group mb-[17px] border-t border-line max-[999px]:mb-0">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2.5 pt-[15px] text-[12px] [&::-webkit-details-marker]:hidden">
        <span className="flex flex-1 items-center justify-between text-text-3">
          {f.total}
          <span className="font-mono text-[12px] font-semibold text-text">{route ? usd(totalCost(route)) : "—"}</span>
        </span>
        <ChevronDown size={13} strokeWidth={2} className="flex-none text-text-3 group-open:rotate-180" aria-hidden="true" />
      </summary>
      {rows.length ? (
        <dl className="m-0 pt-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-[15px] py-[5px] text-[11px]">
              <dt className="text-text-3">{label}</dt>
              <dd className="m-0 text-right font-mono [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </details>
  );
}
