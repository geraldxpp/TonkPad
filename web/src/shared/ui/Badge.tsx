"use client";

import { Bot, Crown, Flame, GraduationCap, Lock, ShieldCheck, Zap } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";

export type BadgeKind = "locked" | "crew" | "agent" | "hot" | "og" | "new" | "graduated" | "rwa";

interface BadgeProps {
  kind: BadgeKind;
  /** The crew badge's fee share ("2%"), or the RWA badge's issuer ("xStocks"). */
  value?: string;
  /** "card" uses the slightly stronger fills from the token-card art. */
  tone?: "default" | "card";
  /** "compact" is the tighter right padding used in table rows. */
  density?: "comfortable" | "compact";
}

const BORDERED = {
  locked: {
    default: "text-locked bg-locked/14 border-locked/38",
    card: "text-locked bg-locked/16 border-locked/42",
  },
  crew: {
    default: "text-gold bg-accent/16 border-gold/38",
    card: "text-gold bg-accent/20 border-gold/42",
  },
  agent: {
    default: "text-agent bg-agent/14 border-agent/38",
    card: "text-agent bg-agent/16 border-agent/42",
  },
  rwa: {
    default: "text-accent-text bg-accent/14 border-accent/38",
    card: "text-accent-text bg-accent/16 border-accent/42",
  },
} as const;

const BASE = "inline-flex items-center rounded-md py-0.5 pl-[5px] text-[11px] font-semibold whitespace-nowrap";

export function Badge({ kind, value, tone = "default", density = "comfortable" }: BadgeProps) {
  const { t } = useI18n();
  const right = density === "compact" ? "pr-1.5" : "pr-[7px]";

  switch (kind) {
    case "hot":
      return (
        <span title={t.badges.hot} className="inline-flex rounded-md bg-hot/14 px-1 py-0.5 text-hot">
          <Flame size={12} fill="currentColor" stroke="none" role="img" aria-label={t.badges.hot} />
        </span>
      );
    case "og":
      return (
        <span className={cn(BASE, right, "gap-[3px] bg-gold/14 text-gold")}>
          <Crown size={11} fill="currentColor" stroke="none" />
          {t.badges.og}
        </span>
      );
    case "new":
      return (
        <span className={cn(BASE, right, "gap-[3px] bg-accent/14 text-accent-text")}>
          <Zap size={11} fill="currentColor" stroke="none" />
          {t.badges.new}
        </span>
      );
    case "graduated":
      return (
        <span className={cn(BASE, "gap-1 pr-[7px] bg-gold/14 text-gold")}>
          <GraduationCap size={12} strokeWidth={2.2} />
          {t.badges.graduated}
        </span>
      );
    case "locked":
      return (
        <span className={cn(BASE, right, "gap-1 border", BORDERED.locked[tone])}>
          <Lock size={11} strokeWidth={2.6} />
          {t.badges.locked}
        </span>
      );
    case "crew":
      return (
        <span className={cn(BASE, right, "gap-1 border", BORDERED.crew[tone])}>
          <Zap size={11} fill="currentColor" stroke="none" />
          {fmt(t.badges.crew, { pct: value ?? "" })}
        </span>
      );
    case "agent":
      return (
        <span className={cn(BASE, right, "gap-1 border", BORDERED.agent[tone])}>
          <Bot size={11} strokeWidth={2.4} />
          {t.badges.agent}
        </span>
      );
    case "rwa":
      return (
        <span title={fmt(t.badges.rwaTitle, { issuer: value ?? "" })} className={cn(BASE, right, "gap-1 border", BORDERED.rwa[tone])}>
          <ShieldCheck size={11} strokeWidth={2.6} />
          {t.badges.rwa}
        </span>
      );
  }
}
