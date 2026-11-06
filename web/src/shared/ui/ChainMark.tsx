import type { CSSProperties } from "react";
import { CHAINS } from "@/shared/config/chains";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";

interface ChainMarkProps {
  chain: ChainId;
  /** Diameter in px. */
  size: number;
  /** Letter size in px. Leave out for a plain dot. */
  letterSize?: number;
  /** Colour of a 2 px ring that separates overlapping marks. */
  ring?: string;
  /** Hide from assistive tech when nearby text already names the chain. */
  decorative?: boolean;
  className?: string;
}

/** Original stand-in chain mark: a letter on a colour. Never the real logo. */
export function ChainMark({ chain, size, letterSize, ring, decorative = false, className }: ChainMarkProps) {
  const c = CHAINS[chain];
  const style: CSSProperties = {
    width: size,
    height: size,
    background: c.background,
    color: c.foreground,
    fontSize: letterSize,
    border: ring ? `2px solid ${ring}` : undefined,
  };
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": c.name, title: c.name } as const);
  return (
    <span
      {...a11y}
      style={style}
      className={cn("inline-flex flex-none items-center justify-center rounded-full font-bold", className)}
    >
      {letterSize ? c.letter : null}
    </span>
  );
}
