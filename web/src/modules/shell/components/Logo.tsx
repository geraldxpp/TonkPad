import { cn } from "@/shared/lib/cn";

interface LogoProps {
  /** Width in px; the height follows the mark's 416 × 506 shape. */
  size?: number;
  className?: string;
}

const RATIO = 506 / 416;

/** The brand cyan of the rounded T, the same in both themes. */
export const BRAND_CYAN = "#00CDE6";

/**
 * The tonkfun.fun mark: the owner's rounded T. Drawn inline (no request, crisp
 * at any size) and decorative, since a link or label around it names the site.
 */
export function Logo({ size = 40, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 416 506"
      width={size}
      height={Math.round(size * RATIO)}
      aria-hidden="true"
      focusable="false"
      className={cn("flex-none", className)}
    >
      <path
        fill={BRAND_CYAN}
        d="M50 0H366C400 0 416 18 416 52V76C416 107 402 122 374 122H296C279 122 269 132 269 151L290 420C293 469 256 506 208 506C160 506 123 469 126 420L147 151C148 132 137 122 120 122H42C13 122 0 108 0 78V52C0 18 17 0 50 0Z"
      />
    </svg>
  );
}
