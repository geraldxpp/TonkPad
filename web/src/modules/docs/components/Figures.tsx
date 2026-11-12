"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { type FigureKey, figureText, sourceText } from "../lib/figure-text";
import { useDocsLive } from "./DocsLive";

/** An amount: "0.005 ETH", "1,073,000,000", "$2.8K". */
const AMOUNT = /(\$?\d[\d,.]*[KMB]?(?:\s(?:test\s)?ETH)?)/;

/** The text with its amounts in the mono face and its words in the UI face. */
function Amounts({ text }: { text: string }) {
  return text.split(AMOUNT).map((part, i) => (i % 2 === 1 ? <span key={i} className="font-mono">{part}</span> : part));
}

/**
 * Live figures from the launchpad: each a label beside its value (stacked
 * on phones), with the dollar value on mainnet. While the launchpad can't be
 * read each one says so; nothing stands in for a figure.
 */
export function Figures({ keys, source = false }: { keys: readonly FigureKey[]; source?: boolean }) {
  const { t } = useI18n();
  const live = useDocsLive();
  const f = t.docs.figures;
  return (
    <div className="mt-3.5 rounded-xl border border-line bg-raised/40 px-4 py-3 max-[599px]:px-3.5">
      <dl aria-live="polite" className="m-0 flex flex-col divide-y divide-line">
        {keys.map((key) => {
          const row = figureText(key, live, f);
          return (
            <div key={key} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-x-4 gap-y-0.5 py-2 text-[12px] leading-5 max-[599px]:grid-cols-1">
              <dt className="text-text-3">{row.label}</dt>
              <dd data-figure={key} className="m-0 min-w-0">
                <span className="text-text">
                  <Amounts text={row.value} />
                </span>
                {row.detail ? (
                  <span className="block text-text-2">
                    <Amounts text={row.detail} />
                  </span>
                ) : null}
                {row.usd ? (
                  <span className="block text-text-3">
                    <Amounts text={row.usd} />
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {source ? <p className="m-0 mt-1 border-t border-line pt-2.5 text-[11px] leading-4 text-text-3">{sourceText(live, f)}</p> : null}
    </div>
  );
}
