"use client";

import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatInteger } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { padLabel } from "../lib/display";
import { formatDayTime, shortAddress } from "../lib/format";

/** The description and the token's facts; the curve, lock and fee only when the token has them. */
export function AboutCard({ detail }: { detail: TokenDetail }) {
  const { t, lang } = useI18n();
  const a = t.token.about;
  const { token, crew, feePct } = detail;
  const facts: [string, string][] = [
    [a.supply, detail.supply === null ? "—" : formatInteger(detail.supply)],
    [a.chain, CHAINS[token.chain].name],
    [a.launchpad, padLabel(token.launchpad, t.token.native)],
    [a.launched, formatDayTime(detail.launchedAt, lang)],
    [a.token, shortAddress(detail.contract)],
  ];
  if (detail.curve) facts.push([a.curve, detail.curve]);
  if (detail.devLock) facts.push([a.lock, detail.devLock.contract]);
  if (feePct !== null) {
    facts.push([a.fee, crew ? fmt(a.feeCrew, { fee: feePct, crew: crew.sharePct }) : fmt(a.feeOnly, { fee: feePct })]);
  }
  return (
    <section aria-labelledby="about-title" className="flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5">
      <h2 id="about-title" className="text-[14px] font-semibold [overflow-wrap:anywhere]">
        {fmt(a.title, { ticker: token.ticker })}
      </h2>
      {detail.description ? (
        <p className="max-w-[720px] text-[13px] leading-5 break-words text-text-2">
          {detail.source !== "live" && token.address === "GHOST" ? a.ghostyDescription : detail.description}
        </p>
      ) : null}
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5">
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-raised p-3">
            <dt className="text-[12px] text-text-3">{label}</dt>
            <dd className="font-mono text-[12px] font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
