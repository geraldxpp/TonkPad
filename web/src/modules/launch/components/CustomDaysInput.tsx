"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { MAX_LOCK_DAYS, MIN_LOCK_DAYS } from "@/shared/tonk/rules";
import { settleDays } from "../lib/form";

interface CustomDaysInputProps {
  /** The time-lock's length in the form. */
  days: number;
  /** The form shows this field's error (a failed check). */
  shown: boolean;
  onDays: (days: number) => void;
}

const usable = (days: number) => Number.isInteger(days) && days >= MIN_LOCK_DAYS && days <= MAX_LOCK_DAYS;

/**
 * A time-lock's custom length, typed digit by digit. Only lengths the
 * launchpad accepts (7–365) reach the form as they're typed, so the preview
 * never shows an impossible lock; the creator's other choices stay as they
 * are whatever passes through the box. Under the box it says when the text
 * can't become a length (empty, not a whole number, over 365). Leaving the
 * box brings the number into 7–365, and leaving it empty puts back the length
 * it had when the box was entered.
 */
export function CustomDaysInput({ days, shown, onDays }: CustomDaysInputProps) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const before = useRef(days);
  const typed = text?.trim() ?? null;
  const hopeless = typed !== null && (typed === "" || !/^\d+$/.test(typed) || Number(typed) > MAX_LOCK_DAYS);
  const error = typed === null ? shown : hopeless;
  return (
    <>
      <label htmlFor="launch-days" className="mt-3 mb-1.5 block text-[12px] text-text-3">
        {t.launch.lock.customDays}
      </label>
      <input
        id="launch-days"
        type="number"
        inputMode="numeric"
        min={MIN_LOCK_DAYS}
        max={MAX_LOCK_DAYS}
        step={1}
        value={text ?? String(days)}
        onFocus={() => {
          before.current = days;
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() !== "" && usable(Number(next))) onDays(Number(next));
        }}
        onBlur={() => {
          // Switching to another window or app isn't leaving the box: it keeps focus for when the page comes back.
          if (!document.hasFocus()) return;
          const settled = settleDays(typed === null ? days : typed === "" ? before.current : Number(typed));
          setText(null);
          if (settled !== days) onDays(settled);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby="launch-days-error"
        className="w-28 rounded-lg border border-line-strong bg-bg px-3 py-2 font-mono text-[13px] text-text aria-[invalid=true]:border-neg"
      />
      {/* Announced only after a failed check: while typing, the box's own state and this text are enough. */}
      <p id="launch-days-error" role={error && typed === null ? "alert" : undefined} className={cn("m-0 mt-1.5 text-[12px] leading-[1.5] text-neg", !error && "hidden")}>
        {t.launch.errors.days}
      </p>
    </>
  );
}
