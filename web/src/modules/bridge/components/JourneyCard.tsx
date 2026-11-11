"use client";

import { ArrowRight, Clock3 } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { BridgeNetwork } from "../lib/networks";
import { NetworkMark } from "./NetworkMark";

function Orbit({ network, caption, end }: { network: BridgeNetwork; caption: string; end?: boolean }) {
  return (
    <div className="w-[112px] min-w-0 flex-none text-center max-[999px]:w-[100px] max-[599px]:w-[112px]">
      <div className={cn("relative mx-auto mb-[15px] flex size-[72px] items-center justify-center rounded-full border bg-bg after:absolute after:-inset-[15px] after:rounded-full after:border after:border-dashed", end ? "border-accent/35 shadow-[0_0_0_7px_rgb(var(--accent-rgb)/0.035)] after:border-accent/20" : "border-line-strong shadow-[0_0_0_7px_color-mix(in_srgb,var(--line)_26%,transparent)] after:border-line-strong/65")}>
        <NetworkMark network={network} size={35} />
      </div>
      <strong className="block truncate text-[11px] font-semibold">{network.name}</strong>
      <span className="mt-1 block text-[10px] text-text-3">{caption}</span>
    </div>
  );
}

/** "Across chains. In a few steps.": where it leaves, where it lands, and how long that takes. */
export function JourneyCard({ from, to, eta }: { from: BridgeNetwork; to: BridgeNetwork; eta: string | null }) {
  const { t } = useI18n();
  const j = t.bridge.journey;
  return (
    <section aria-labelledby="bridge-journey-title" className="overflow-hidden rounded-2xl border border-line p-[22px] [background:radial-gradient(ellipse_at_85%_45%,rgb(var(--accent-rgb)/0.065),transparent_65%),var(--surface)] max-[999px]:p-5">
      <h2 id="bridge-journey-title" className="font-display text-[18px] font-bold tracking-[-0.35px]">
        {j.title}
      </h2>
      <span className="mt-[7px] flex items-center gap-[7px] text-[10px] text-text-3">
        <span aria-hidden="true" className="size-[5px] rounded-full bg-pos" />
        {j.live}
      </span>
      <div className="mt-8 mb-[26px] flex items-center justify-between gap-[5px]">
        <Orbit network={from} caption={j.departure} />
        <div aria-hidden="true" className="mb-[43px] flex min-w-[20px] flex-1 items-center gap-[5px]">
          <span className="flex-1 border-t border-dashed border-line-strong" />
          <span className="flex size-[25px] flex-none items-center justify-center rounded-full bg-accent/8 text-accent-text">
            <ArrowRight size={13} strokeWidth={2} />
          </span>
          <span className="flex-1 border-t border-dashed border-line-strong" />
        </div>
        <Orbit network={to} caption={j.destination} end />
      </div>
      <div className="flex items-center justify-between gap-2.5 border-t border-line pt-4 text-[11px] text-text-3">
        <span className="flex items-center gap-1.5">
          <Clock3 size={12} strokeWidth={2} aria-hidden="true" />
          {j.delivery}
        </span>
        <strong className="font-mono text-[14px] font-semibold text-accent-text">{eta ?? "—"}</strong>
      </div>
    </section>
  );
}
