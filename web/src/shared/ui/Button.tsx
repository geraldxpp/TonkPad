import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export type ButtonVariant = "cta" | "buy" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  cta: "bg-cta text-on-cta shadow-cta",
  buy: "bg-pos text-on-pos",
  secondary: "bg-raised text-text border border-line-strong",
  ghost: "bg-transparent text-text-2",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-[14px]",
  lg: "h-11 gap-1.5 rounded-[14px] px-5 text-[16px]",
};

/** Class names for a button, so links can share the same look (e.g. "Buy"). */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center font-semibold whitespace-nowrap",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}
