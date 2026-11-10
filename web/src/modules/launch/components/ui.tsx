import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** The four sections' colours: cyan basics, green lock, gold economics, violet agent. */
export type Tone = "accent" | "crew" | "creator" | "agent";

const NUMBER: Record<Tone, string> = {
  accent: "border-accent/15 bg-accent/7 text-accent-text",
  crew: "border-pos/16 bg-pos/8 text-pos",
  creator: "border-gold/16 bg-gold/8 text-gold",
  agent: "border-agent/16 bg-agent/8 text-agent",
};

const PRESSED: Record<Tone, string> = {
  accent: "aria-pressed:border-accent/50 aria-pressed:bg-accent/8 aria-pressed:text-accent-text",
  crew: "aria-pressed:border-pos aria-pressed:bg-pos/7 aria-pressed:text-pos",
  creator: "aria-pressed:border-gold aria-pressed:bg-gold/7 aria-pressed:text-gold",
  agent: "aria-pressed:border-agent aria-pressed:bg-agent/8 aria-pressed:text-agent",
};

export const INPUT =
  "w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-[14px] leading-[1.6] text-text placeholder:text-text-3 aria-[invalid=true]:border-neg";
export const HELP = "m-0 text-[11px] leading-[1.7] text-text-3";
export const INSET = "rounded-xl border border-line";

interface StepCardProps {
  /** The section's anchor: "step-1" … "step-4". */
  id: string;
  number: string;
  tone: Tone;
  title: string;
  subtitle: string;
  /** Right of the heading: a tag or a switch. */
  aside?: ReactNode;
  /** On phones only the current step shows. */
  hiddenOnPhone?: boolean;
  children: ReactNode;
}

/** One of the studio's four numbered cards. */
export function StepCard({ id, number, tone, title, subtitle, aside, hiddenOnPhone = false, children }: StepCardProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 rounded-2xl border border-line bg-surface p-6 max-md:p-4", hiddenOnPhone && "max-md:hidden")}>
      <div className="mb-6 flex items-center gap-3 max-md:mb-5">
        <span aria-hidden="true" className={cn("flex size-[30px] flex-none items-center justify-center rounded-lg border font-mono text-[12px] font-medium", NUMBER[tone])}>
          {number}
        </span>
        <div className="min-w-0 flex-auto">
          <h2 id={`${id}-title`} className="font-display text-[22px] leading-7 font-extrabold tracking-[-0.03em]">
            {title}
          </h2>
          <p className="m-0 mt-0.5 text-[12px] text-text-3">{subtitle}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface FieldProps {
  id: string;
  label: string;
  /** "9/32" beside the label. */
  count?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** A labelled field with its counter and error; the control inside carries `id` and `aria-describedby={id + "-error"}`. */
export function Field({ id, label, count, error, className, children }: FieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-medium text-text-2">
          {label}
        </label>
        {count ? <span className="font-mono text-[10px] text-text-3">{count}</span> : null}
      </div>
      {children}
      <p id={`${id}-error`} role={error ? "alert" : undefined} className={cn("m-0 mt-1.5 text-[12px] leading-[1.5] text-neg", !error && "hidden")}>
        {error}
      </p>
    </div>
  );
}

interface OptionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  tone?: Tone;
}

/** A choice in a row of options: one is pressed; a locked one says why in its title. */
export function Option({ pressed, tone = "accent", className, disabled, children, ...rest }: OptionProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        "min-h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-2 py-2 font-mono text-[12px] text-text-3",
        disabled ? "cursor-not-allowed opacity-45" : "hover:text-text-2",
        PRESSED[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
