"use client";

import { useRef } from "react";
import { useSweepSync } from "@/modules/shell/hooks/useSweepSync";
import type { ExploreData } from "../data/get-explore-data";
import { layoutBlip } from "../lib/radar";
import { RadarBlip } from "./RadarBlip";
import { RadarGrid } from "./RadarGrid";

interface RadarProps {
  blips: ExploreData["blips"];
}

/**
 * 300 px scope. The wedge turns once every 6 s; the blips' pings are delayed
 * by the time the leading edge takes to reach them, and all of it runs on the
 * shared sweep clock so pings land exactly as the edge passes.
 */
export function Radar({ blips }: RadarProps) {
  const ref = useRef<HTMLDivElement>(null);
  useSweepSync(ref);
  return (
    <div ref={ref} data-testid="radar" className="relative mx-auto mt-1 h-[300px] w-[300px] max-w-full flex-none">
      <RadarGrid />
      <div
        aria-hidden="true"
        data-testid="radar-sweep"
        className="tk-sweep absolute top-0 left-0 size-[300px] rounded-full [background:conic-gradient(from_40deg,rgba(140,123,255,0)_0deg,rgba(140,123,255,0)_276deg,rgba(140,123,255,0.42)_360deg)]"
      >
        <div className="absolute top-0 left-[149.2px] h-[150px] w-[1.6px] origin-bottom rotate-[40deg] bg-sweep" />
      </div>
      <div aria-hidden="true" className="absolute top-[146px] left-[146px] size-2 rounded-full bg-sweep" />
      {blips.map((blip) => (
        <RadarBlip key={blip.ticker} blip={blip} layout={layoutBlip(blip)} />
      ))}
    </div>
  );
}
