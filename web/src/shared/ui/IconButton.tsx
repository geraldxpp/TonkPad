import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/shared/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; icon buttons have no visible text. */
  label: string;
  size?: 32 | 36 | 40;
  ref?: Ref<HTMLButtonElement>;
}

/** Square icon button on the surface colour (carousel arrows, bell, phone search; 32 px in the phone top bar). */
export function IconButton({ label, size = 36, className, type = "button", children, ref, ...rest }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        "relative inline-flex flex-none items-center justify-center rounded-xl border border-line bg-surface text-text-2",
        size === 32 ? "size-8" : size === 36 ? "size-9" : "size-10",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
