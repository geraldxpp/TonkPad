import { cn } from "@/shared/lib/cn";
import { hexToRgba } from "@/shared/lib/color";
import { TokenArt } from "@/shared/ui/TokenArt";
import type { ExploreData } from "../data/get-explore-data";
import type { BlipLayout } from "../lib/radar";

interface RadarBlipProps {
  blip: ExploreData["blips"][number];
  layout: BlipLayout;
}

/**
 * One token on the radar. Labelled blips keep the design's two static rings;
 * every blip pings (ring out + brighten) when the sweep's leading edge passes.
 */
export function RadarBlip({ blip, layout }: RadarBlipProps) {
  const size = blip.size;
  const animationDelay = `${layout.delay.toFixed(3)}s`;
  return (
    <>
      <div
        data-blip={blip.ticker}
        className="absolute"
        style={{ left: layout.left, top: layout.top, width: size, height: size }}
      >
        {blip.label ? (
          <>
            <span
              aria-hidden="true"
              className="absolute -inset-[15px] rounded-full border-[1.5px]"
              style={{ borderColor: hexToRgba(blip.glow, 0.2) }}
            />
            <span
              aria-hidden="true"
              className="absolute -inset-[7px] rounded-full border-[1.5px]"
              style={{ borderColor: hexToRgba(blip.glow, 0.45) }}
            />
          </>
        ) : null}
        <span
          aria-hidden="true"
          className="tk-ping absolute inset-0 rounded-full border-[1.5px]"
          style={{ borderColor: hexToRgba(blip.glow, 0.75), animationDelay }}
        />
        <TokenArt
          src={blip.art}
          label={blip.ticker}
          alt={`$${blip.ticker}`}
          size={size}
          eager
          className="tk-blip relative size-full rounded-full"
          style={{
            boxShadow: `0 0 0 1.5px rgba(255,255,255,0.85), 0 0 14px ${hexToRgba(blip.glow, 0.7)}`,
            animationDelay,
          }}
        />
      </div>
      {blip.label && layout.label ? (
        <span
          data-blip-label={blip.ticker}
          className="absolute inline-flex items-center gap-1.5 rounded-[9px] border border-line-strong bg-raised px-2 py-1 whitespace-nowrap"
          style={{ left: layout.label.left, top: layout.label.top }}
        >
          <span className="text-[12px] font-semibold">${blip.ticker}</span>
          <span className={cn("font-mono text-[12px] font-semibold", /^[−-]/.test(blip.label) ? "text-neg" : "text-pos")}>
            {blip.label}
          </span>
        </span>
      ) : null}
    </>
  );
}
