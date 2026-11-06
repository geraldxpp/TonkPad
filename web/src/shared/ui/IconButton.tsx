import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; icon buttons have no visible text. */
  label: string;
  size?: 36 | 40;
}

/** Square icon button on the surface colour (carousel arrows, bell). */
export function IconButton({ label, size = 36, className, type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "relative inline-flex flex-none items-center justify-center rounded-xl border border-line bg-surface text-text-2",
        size === 36 ? "size-9" : "size-10",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
