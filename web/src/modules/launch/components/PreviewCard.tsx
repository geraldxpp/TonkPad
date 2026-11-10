"use client";

import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth, formatEthShort, percentText } from "@/shared/tonk/format";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { type StudioProps, tokenLetter } from "./types";

/**
 * The token as Explore will show it: its letter on the brand art, name and
 * ticker, the badges this launch earns, the starting cap and how much of the
 * curve the dev buy fills. The art stays dark in both themes.
 */
export function TokenPreview({ state, view, unit }: Pick<StudioProps, "state" | "view" | "unit">) {
  const { t } = useI18n();
  const p = t.launch.preview;
  const { form } = state;
  const name = form.name.trim() || p.yourToken;
  const ticker = form.ticker.trim();
  const letter = tokenLetter(form);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      <div data-theme="dark" className="relative flex h-[137px] items-center justify-center overflow-hidden [background:var(--art-scene)]">
        <span aria-hidden="true" className="absolute inset-x-[59px] inset-y-[15px] -rotate-[35deg] rounded-full border border-art-ink/9 shadow-[0_0_0_30px_rgb(161_255_255/0.02),0_0_0_60px_rgb(161_255_255/0.012)]" />
        <span className="absolute top-2.5 left-2.5 z-[2]">
          <Badge kind="new" />
        </span>
        <ChainMark chain="rh" size={18} decorative className="absolute top-2.5 right-2.5 z-[2]" />
        <span aria-hidden="true" className="relative z-[1] font-display text-[84px] leading-none font-extrabold tracking-[-0.05em] text-art-ink [text-shadow:0_5px_25px_rgb(0_49_63/0.4)]">
          {letter}
        </span>
      </div>
      <div className="px-3 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <strong className="font-display text-[15px] font-bold [overflow-wrap:anywhere]">{name}</strong>
          {ticker ? <span className="font-mono text-[11px] text-text-3">${ticker}</span> : null}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {view.score.lockedBadge ? <Badge kind="locked" /> : null}
          {form.crew >= 100 ? <Badge kind="crew" value={`${form.crew / 100}%`} /> : null}
          {form.agent ? <Badge kind="agent" /> : null}
          <Badge kind="shield" />
        </div>
        <div className="mt-3.5 flex items-center gap-1.5 text-[11px] text-text-3">
          {p.startsAt}
          <strong className="ml-auto font-mono text-[13px] font-semibold text-text">
            {formatEth(view.startCap)} {unit}
          </strong>
          <small className="text-[10px]">{p.mcap}</small>
        </div>
        <span role="meter" aria-label={p.curveFilled} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.curvePct)} className="mt-2.5 block h-[3px] overflow-hidden rounded bg-input">
          <span className="block h-full bg-accent" style={{ width: `${Math.min(100, view.curvePct)}%` }} />
        </span>
        <p className="m-0 mt-1.5 flex justify-between gap-2 font-mono text-[10px] leading-[1.7] text-text-3">
          <span>{fmt(p.curve, { pct: percentText(view.curvePct, 1) })}</span>
          <span className="text-right">{fmt(p.target, { target: `${formatEthShort(view.target)} ${unit}` })}</span>
        </p>
      </div>
    </div>
  );
}

/** The preview in its card, for the right column. */
export function PreviewCard(props: Pick<StudioProps, "state" | "view" | "unit">) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="launch-preview-title" className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="launch-preview-title" className="m-0 text-[13px] font-semibold">
          {t.launch.preview.title}
        </h2>
        <span className="text-[10px] text-text-3">{t.launch.preview.asExplore}</span>
      </div>
      <TokenPreview {...props} />
    </section>
  );
}
