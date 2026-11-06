import { ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { ScoreLevel } from "@/shared/types/token";

/** Mission score colours from CLAUDE.md (the reference's LVL table). */
export const SCORE_LEVELS: Record<ScoreLevel, string> = {
  Safe: "text-pos bg-[rgba(54,214,140,0.12)]",
  Caution: "text-warn bg-[rgba(255,181,71,0.13)]",
  Risky: "text-neg bg-[rgba(255,92,116,0.12)]",
};

interface ScorePillProps {
  score: number;
  level: ScoreLevel;
  /** "row" is the table pill, "inline" the slightly smaller one in Mission Pick. */
  variant?: "row" | "inline";
}

export function ScorePill({ score, level, variant = "row" }: ScorePillProps) {
  const Icon = level === "Risky" ? TriangleAlert : ShieldCheck;
  const row = variant === "row";
  return (
    <span
      title={`Mission score ${score} · ${level}`}
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
