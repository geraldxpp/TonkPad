"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { scoreLevel } from "@/shared/tonk/score";
import { SCORE_LEVELS } from "@/shared/ui/score-levels";
import type { LaunchView } from "../lib/view";

const signed = (points: number) => (points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0");

/**
 * The launch's Mission score at launch and ten minutes on, with the rows
 * behind it: Mission score v2's launch-time rows, the same model Explore uses.
 */
export function ScoreCard({ view, open = false }: { view: LaunchView; open?: boolean }) {
  const { t } = useI18n();
  const s = t.launch.score;
  const { score } = view;
  const level = scoreLevel(score.now);
  const later = scoreLevel(score.later);
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface p-3.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-auto">
          <span className="block text-[10px] font-semibold tracking-[0.06em] text-text-3 uppercase">{s.title}</span>
          <small className="mt-0.5 block text-[11px] text-text-3">{s.atLaunch}</small>
        </div>
        <strong className={cn("font-mono text-[23px] leading-7 font-semibold", SCORE_LEVELS[level].split(" ")[0])}>{score.now}</strong>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", SCORE_LEVELS[level])}>{t.score[level]}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="flex-none text-text-3 transition-transform group-open:rotate-180" />
        <span className="sr-only">{s.details}</span>
      </summary>
      <div className="mt-3.5 border-t border-line pt-3">
        <p className={cn("m-0 mb-3.5 flex items-center gap-2 text-[12px]", SCORE_LEVELS[later].split(" ")[0])}>
          <ArrowRight size={13} strokeWidth={2.2} aria-hidden="true" className="flex-none" />
          {fmt(s.after, { score: `${score.later} ${t.score[later]}` })}
        </p>
        <dl className="m-0">
          {score.rows.map((row) => (
            <div key={row.key} className="my-2 flex justify-between gap-3 text-[12px]">
              <dt className="text-text-2">{s[row.key]}</dt>
              <dd className={cn("m-0 font-mono", row.points > 0 && row.key !== "base" && "text-pos", row.points < 0 && "text-neg")}>{row.key === "base" ? row.points : signed(row.points)}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 mt-2.5 border-t border-line pt-2.5 text-[11px] leading-[1.8] text-text-3">{s.note}</p>
      </div>
    </details>
  );
}
