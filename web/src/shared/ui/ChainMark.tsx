import Image from "next/image";
import type { CSSProperties } from "react";
import { CHAINS } from "@/shared/config/chains";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";

interface ChainMarkProps {
  chain: ChainId;
  /** Diameter in px. */
  size: number;
  /** Letter size in px, for the letter mark shown while a chain has no logo. Leave out for a plain dot. */
  letterSize?: number;
  /** Colour of a 2 px ring that separates overlapping marks. */
  ring?: string;
  /** Hide from assistive tech when nearby text already names the chain. */
  decorative?: boolean;
  className?: string;
}

/** A chain's round mark: its own logo (public/chains/), or a letter on its colour while there is no logo file. */
export function ChainMark({ chain, size, letterSize, ring, decorative = false, className }: ChainMarkProps) {
  const c = CHAINS[chain];
  const border = ring ? `2px solid ${ring}` : undefined;
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": c.name, title: c.name } as const);
  if (c.logo) {
    return (
      <span
        {...a11y}
        style={{ width: size, height: size, border }}
        className={cn("inline-flex flex-none overflow-hidden rounded-full", className)}
      >
        <Image src={c.logo} alt="" width={size} height={size} unoptimized className="block size-full object-cover" />
      </span>
    );
  }
  const style: CSSProperties = {
    width: size,
    height: size,
    background: c.background,
    color: c.foreground,
    fontSize: letterSize,
    border,
  };
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
