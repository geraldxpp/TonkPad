"use client";

import { Bell, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { useAlertRules } from "../hooks";
import { alertsOn } from "../mode";
import type { AlertToken } from "../types";
import { AlertForm } from "./AlertForm";

interface AlertMeButtonProps {
  token: AlertToken;
  /** Null until a market has priced the token: no alert can be set then. */
  priceUsd: number | null;
  marketCap: number;
  className?: string;
}

/** The token page's bell: opens "Alert me when…"; it rings while the token has an alert switched on. */
export function AlertMeButton({ token, priceUsd, marketCap, className }: AlertMeButtonProps) {
  const { t } = useI18n();
  const rules = useAlertRules();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2_500);
    return () => clearTimeout(timer);
  }, [saved]);
  if (!alertsOn() || priceUsd === null || !(priceUsd > 0)) return null;
  const symbol = token.symbol || token.name;
  const ringing = rules.some((rule) => rule.on && rule.token.address === token.address);
  const Icon = ringing ? BellRing : Bell;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={fmt(t.alerts.form.button, { symbol })}
        title={fmt(t.alerts.form.button, { symbol })}
        onClick={() => setOpen(true)}
        className={cn(className, ringing && "text-accent-text hover:text-accent-text")}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <span aria-live="polite" className="sr-only">
        {saved ? t.alerts.form.saved : ""}
      </span>
      {open ? (
        <AlertForm
          open
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setSaved(true);
          }}
          token={token}
          priceUsd={priceUsd}
          marketCap={marketCap}
        />
      ) : null}
    </>
  );
}
