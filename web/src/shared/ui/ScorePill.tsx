"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ScoreLevel } from "@/shared/types/token";

/** Mission score colours from CLAUDE.md (the reference's LVL table), as theme tints. */
export const SCORE_LEVELS: Record<ScoreLevel, string> = {
  Safe: "text-pos bg-pos/12",
  Caution: "text-warn bg-warn/13",
  Risky: "text-neg bg-neg/12",
};

interface ScorePillProps {
  score: number;
  level: ScoreLevel;
  /** "row" is the table pill, "inline" the slightly smaller one in Mission Pick. */
  variant?: "row" | "inline";
}

export function ScorePill({ score, level, variant = "row" }: ScorePillProps) {
  const { t } = useI18n();
  const Icon = level === "Risky" ? TriangleAlert : ShieldCheck;
  const row = variant === "row";
  return (
    <span
      title={fmt(t.score.title, { score, level: t.score[level] })}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[12px] font-semibold",
        row ? "rounded-lg py-[3px] pl-1.5 pr-2" : "rounded-[7px] py-0.5 pl-[5px] pr-[7px]",
        SCORE_LEVELS[level],
      )}
    >
      <Icon size={row ? 13 : 12} strokeWidth={row ? 2.3 : 2.4} />
      {score}
    </span>
  );
}
