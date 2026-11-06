"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
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

/** Bleeds the row into the page gutter so cards glide in and out at the edges. */
const BLEED =
  "-mx-[clamp(16px,3vw,40px)] px-[clamp(16px,3vw,40px)] [mask-image:linear-gradient(90deg,transparent,#000_clamp(16px,3vw,40px),#000_calc(100%_-_clamp(16px,3vw,40px)),transparent)]";

export function HeatingUp({ cards }: HeatingUpProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { step } = useAutoScroll(scrollerRef, trackRef);

  return (
    <section aria-labelledby="hot-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <h2
            id="hot-title"
            className="m-0 font-display text-[28px] leading-8 font-bold tracking-[-0.015em] max-md:text-[24px] max-md:leading-7"
          >
            Heating up now
          </h2>
          <span className="text-[12px] text-text-3">Ranked by buy velocity over the last 15 minutes</span>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-transparent px-2.5 text-[14px] text-text-2 max-md:-mr-2.5"
        >
          View all
          <ChevronRight size={16} strokeWidth={2} />
        </button>
        {/* Phones swipe the row instead. */}
        <IconButton label="Previous" className="max-md:hidden" onClick={() => step(-1)}>
          <ChevronLeft size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Next" className="max-md:hidden" onClick={() => step(1)}>
          <ChevronRight size={18} strokeWidth={1.8} />
        </IconButton>
      </div>
      <div
        ref={scrollerRef}
        data-testid="heating-cards"
        className={cn(
          "-my-2 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          BLEED,
        )}
      >
        <div ref={trackRef} className="flex w-max gap-4 max-md:gap-3">
          {Array.from({ length: COPIES }, (_, copy) => (
            <div
              key={copy}
              className={cn("flex gap-4 max-md:gap-3", copy > 0 && "motion-reduce:hidden")}
              aria-hidden={copy > 0 || undefined}
              inert={copy > 0}
            >
              {cards.map(({ token, color }, index) => (
                <TokenCard key={token.ticker} token={token} color={color} rank={index + 1} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
