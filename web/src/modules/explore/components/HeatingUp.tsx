"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/IconButton";
import type { ExploreData } from "../data/get-explore-data";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { TokenCard } from "./TokenCard";

interface HeatingUpProps {
  cards: ExploreData["heating"];
}

/** Enough copies that the row stays full on ultrawide screens while it loops. */
const COPIES = 3;

/**
 * The full set the worker sends. Fewer cards (a quiet spell, or just after
 * the worker starts) would only loop into duplicates side by side, so they
 * sit still in a single row instead.
 */
const LOOP_MIN_CARDS = 5;

export function HeatingUp({ cards }: HeatingUpProps) {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const loops = cards.length >= LOOP_MIN_CARDS;
  const { step } = useAutoScroll(scrollerRef, trackRef, loops);

  return (
    <section aria-labelledby="hot-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <h2 id="hot-title" className="m-0 font-display text-[21px] leading-7 font-bold tracking-[-0.02em]">
            {t.heating.title}
          </h2>
          <span className="text-[12px] text-text-3">{t.heating.subtitle}</span>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-transparent px-2.5 text-[14px] text-text-2 max-md:-mr-2.5"
        >
          {t.heating.viewAll}
          <ChevronRight size={16} strokeWidth={2} />
        </button>
        {/* Phones swipe the row instead. */}
        <IconButton label={t.heating.previous} className="max-md:hidden" onClick={() => step(-1)}>
          <ChevronLeft size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label={t.heating.next} className="max-md:hidden" onClick={() => step(1)}>
          <ChevronRight size={18} strokeWidth={1.8} />
        </IconButton>
      </div>
      <div
        ref={scrollerRef}
        data-testid="heating-cards"
        className="-mx-1 -my-2 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={trackRef} className="flex w-max gap-4 max-md:gap-3">
          {Array.from({ length: loops ? COPIES : 1 }, (_, copy) => (
            <div
              key={copy}
              className={cn("flex gap-4 max-md:gap-3", copy > 0 && "motion-reduce:hidden")}
              aria-hidden={copy > 0 || undefined}
              inert={copy > 0}
            >
              {cards.map(({ token }, index) => (
                <TokenCard key={token.address} token={token} rank={index + 1} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
