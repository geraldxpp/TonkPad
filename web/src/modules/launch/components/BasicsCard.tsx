"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { LIMITS } from "@/shared/tonk/metadata";
import type { FieldKey } from "../lib/validate";
import { DevBuyBox } from "./DevBuyBox";
import { ProtocolSummary } from "./ProtocolSummary";
import { LETTER_TILE, type StudioProps, tokenLetter } from "./types";
import { Field, HELP, INPUT, StepCard } from "./ui";

/** Card 1: the launchpad's facts, the token's name, ticker, description and links, and the initial dev buy. */
export function BasicsCard(props: StudioProps & { note: string; hiddenOnPhone: boolean }) {
  const { t } = useI18n();
  const l = t.launch;
  const b = l.basics;
  const { form, set, touch, showsError } = props.state;
  const error = (key: FieldKey) => (showsError(key) ? l.errors[key as Exclude<FieldKey, "devBuy">] : null);
  const text = (key: "name" | "description" | "x" | "telegram" | "website", extra: { placeholder?: string; maxLength?: number } = {}) => ({
    id: `launch-${key}`,
    value: form[key],
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
    onBlur: () => touch(key),
    "aria-invalid": showsError(key) ? (true as const) : undefined,
    "aria-describedby": `launch-${key}-error`,
    autoComplete: "off",
    ...extra,
  });
  return (
    <StepCard id="step-1" number="01" tone="accent" title={l.steps.basics} subtitle={b.subtitle} hiddenOnPhone={props.hiddenOnPhone}>
      <ProtocolSummary view={props.view} settings={props.settings} unit={props.unit} note={props.note} />
      <div className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5">
        <Field id="launch-name" label={b.name} count={`${form.name.length}/${LIMITS.name}`} error={error("name")}>
          <input {...text("name", { maxLength: LIMITS.name })} required className={INPUT} />
        </Field>
        <Field id="launch-ticker" label={b.ticker} count={`${form.ticker.length}/${LIMITS.ticker}`} error={error("ticker")}>
          <input
            id="launch-ticker"
            value={form.ticker}
            onChange={(event) => set("ticker", event.target.value.toUpperCase())}
            onBlur={() => touch("ticker")}
            maxLength={LIMITS.ticker}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={showsError("ticker") ? true : undefined}
            aria-describedby="launch-ticker-error"
            className={`${INPUT} font-mono tracking-[0.04em]`}
          />
        </Field>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="rounded-xl border border-dashed border-line-strong bg-bg px-3 py-3.5 text-center">
          <span aria-hidden="true" className={`${LETTER_TILE} mx-auto size-[58px] rounded-[14px] text-[37px]`}>
            {tokenLetter(form)}
          </span>
          <strong className="mt-2.5 block text-[12px] font-medium">{b.image}</strong>
          <small className="mt-1 block text-[10px] leading-[1.6] text-text-3">{b.imageSoon}</small>
        </div>
        <Field id="launch-description" label={b.description} count={`${form.description.length}/${LIMITS.description}`} error={error("description")}>
          <textarea {...text("description")} rows={5} className={`${INPUT} min-h-[128px] resize-y`} />
        </Field>
      </div>
      <div className="mt-5 flex flex-col gap-1">
        <strong className="text-[13px] font-medium">{b.socials}</strong>
        <p className={HELP}>{b.socialsHelp}</p>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <Field id="launch-x" label={b.x} error={error("x")}>
          <input {...text("x", { placeholder: "@handle", maxLength: LIMITS.link })} className={INPUT} />
        </Field>
        <Field id="launch-telegram" label={b.telegram} error={error("telegram")}>
          <input {...text("telegram", { placeholder: "t.me/…", maxLength: LIMITS.link })} inputMode="url" className={INPUT} />
        </Field>
        <Field id="launch-website" label={b.website} error={error("website")}>
          <input {...text("website", { placeholder: "example.com", maxLength: LIMITS.link })} inputMode="url" className={INPUT} />
        </Field>
      </div>
      <DevBuyBox {...props} />
    </StepCard>
  );
}
