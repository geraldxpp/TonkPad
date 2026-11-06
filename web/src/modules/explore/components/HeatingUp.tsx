import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/shared/ui/IconButton";
import type { ExploreData } from "../data/get-explore-data";
import { TokenCard } from "./TokenCard";

interface HeatingUpProps {
  cards: ExploreData["heating"];
}

export function HeatingUp({ cards }: HeatingUpProps) {
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
        <IconButton label="Previous" className="max-md:hidden">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Next" className="max-md:hidden">
          <ChevronRight size={18} strokeWidth={1.8} />
        </IconButton>
      </div>
      <div
        data-testid="heating-cards"
        className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 max-md:-mx-4 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4 max-md:gap-3 max-md:overflow-x-auto max-md:px-4 max-md:py-2 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
      >
        {cards.map(({ token, color }, index) => (
          <TokenCard key={token.ticker} token={token} color={color} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}
