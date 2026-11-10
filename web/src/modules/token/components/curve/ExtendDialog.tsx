"use client";

import { type ReactNode, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { DAY_SECONDS, type DevLockState, extendLock, MIN_EXTENSION_DAYS } from "@/shared/tonk/lock";
import { Sheet } from "@/shared/ui/Sheet";

const PRESETS = [7, 30, 90, 180] as const;
const MAX_DAYS = 3650;

interface ExtendDialogProps {
  open: boolean;
  onClose: () => void;
  lock: DevLockState;
  /** Unix seconds: the page's latest read of the chain. */
  now: number;
  /** Something is with the wallet or confirming. */
  busy: boolean;
  /** Where the extension stands, once it has been asked for. */
  note: ReactNode;
  /** A date in the page's language, with its year. */
  formatDate: (seconds: number) => string;
  onExtend: (days: number) => void;
}

/**
 * Extend the lock: days to add (7 or more), the end date that makes, and
 * for a vest the plain consequence: it starts vesting again from now. A lock
 * can be made longer, never shorter, so this says so before the wallet opens.
 */
export function ExtendDialog({ open, onClose, lock, now, busy, note, formatDate, onExtend }: ExtendDialogProps) {
  const { t } = useI18n();
  const c = t.mission.creator;
  const [text, setText] = useState("30");
  const days = /^\d{1,4}$/.test(text) ? Number(text) : 0;
  const valid = days >= MIN_EXTENSION_DAYS && days <= MAX_DAYS;
  const next = valid ? extendLock(lock, now, days * DAY_SECONDS) : "short";
  return (
    <Sheet open={open} onClose={onClose} title={c.extendTitle} subtitle={c.extendSub} busy={busy}>
      <div className="flex flex-col gap-2">
        <label htmlFor="mission-extend-days" className="text-[12px] font-medium text-text-2">
          {c.extendDays}
        </label>
        <div className="flex flex-wrap gap-1.5">
          <input
            id="mission-extend-days"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-invalid={valid ? undefined : true}
            aria-describedby="mission-extend-help"
            className="w-24 min-w-0 rounded-lg border border-line-strong bg-bg px-3 py-2 font-mono text-[14px] aria-[invalid=true]:border-neg"
          />
          <div role="group" aria-label={c.extendDays} className="flex flex-auto gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={days === preset}
                onClick={() => setText(String(preset))}
                className={cn("min-h-10 min-w-0 flex-1 rounded-lg border px-1 font-mono text-[12px]", days === preset ? "border-pos bg-pos/7 text-pos" : "border-line-strong bg-bg text-text-3")}
              >
                {fmt(c.extendPreset, { days: preset })}
              </button>
            ))}
          </div>
        </div>
        <p id="mission-extend-help" className={cn("m-0 text-[12px]", valid ? "text-text-3" : "text-neg")}>
          {c.extendMin}
        </p>
      </div>
      {typeof next !== "string" ? (
        <dl className="m-0 flex flex-col gap-2 rounded-xl border border-line bg-bg p-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-text-3">{t.mission.facts.ends}</dt>
            <dd className="m-0 font-mono">{formatDate(lock.end)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-3">{c.extendNewEnd}</dt>
            <dd className="m-0 font-mono font-semibold text-pos">{formatDate(next.end)}</dd>
          </div>
        </dl>
      ) : null}
      {lock.type === "linear" ? <p className="m-0 rounded-lg bg-warn/7 px-3.5 py-3 text-[12px] leading-[1.6] text-warn">{c.extendVestNote}</p> : null}
      {note}
      <button
        type="button"
        disabled={busy || typeof next === "string"}
        onClick={() => onExtend(days)}
        className="min-h-11 rounded-lg bg-cta px-4 text-[14px] font-semibold text-on-cta disabled:cursor-not-allowed disabled:opacity-60"
      >
        {fmt(c.extendConfirm, { days: valid ? days : MIN_EXTENSION_DAYS })}
      </button>
    </Sheet>
  );
}
