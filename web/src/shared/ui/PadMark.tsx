import Image from "next/image";
import type { CSSProperties } from "react";
import { LAUNCHPADS } from "@/shared/config/launchpads";
import { cn } from "@/shared/lib/cn";
import type { LaunchpadId } from "@/shared/types/launchpad";

interface PadMarkProps {
  pad: LaunchpadId;
  /** 16 for chips and cards, 18 (with a ring) on table avatars. */
  size?: 16 | 18;
  /** Colour of a 2 px ring, used where the mark overlaps token art. */
  ring?: string;
  /** Hide from assistive tech when nearby text already names the launchpad. */
  decorative?: boolean;
  className?: string;
}

/**
 * A launchpad's mark on a rounded square: its own logo (public/launchpads/),
 * or its letter(s) on its colour while there is no logo file.
 */
export function PadMark({ pad, size = 16, ring, decorative = false, className }: PadMarkProps) {
  const p = LAUNCHPADS[pad];
  const style: CSSProperties = {
    background: p.background,
    color: p.foreground,
    border: ring ? `2px solid ${ring}` : undefined,
  };
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": p.name, title: p.name } as const);
  const shape = size === 16 ? "h-4 min-w-4 rounded-[5px]" : "h-[18px] min-w-[18px] rounded-md";
  if (p.logo) {
    // The logo sets its own shape and colours (some have transparent corners), so no fill behind it.
    return (
      <span {...a11y} style={{ border: style.border }} className={cn("inline-block overflow-hidden", shape, className)}>
        <Image src={p.logo} alt="" width={size} height={size} unoptimized className="block size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      {...a11y}
      style={style}
      className={cn(
        "inline-block px-[3px] text-center font-bold",
        shape,
        size === 16 ? "text-[9px] leading-4" : "text-[8px] leading-[14px]",
        className,
      )}
    >
      {p.letter}
    </span>
  );
}
