"use client";

import { Bot } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { bpsText } from "@/shared/tonk/format";
import { AGENT_VOICES, LIMITS } from "@/shared/tonk/metadata";
import type { FieldKey } from "../lib/validate";
import { TokenTile } from "./TokenTile";
import type { StudioProps } from "./types";
import { Field, INPUT, StepCard } from "./ui";

/** Card 4: the Token Agent's name, role, brief and voice, with a sample reply built from the launch's own settings. */
export function AgentCard({ state, view, hiddenOnPhone }: StudioProps & { hiddenOnPhone: boolean }) {
  const { t } = useI18n();
  const a = t.launch.agent;
  const { form, set, touch, showsError } = state;
  const error = (key: "agentName" | "agentRole" | "agentBrief") => (showsError(key) ? t.launch.errors[key] : null);
  const field = (key: "agentName" | "agentRole" | "agentBrief", max: number) => ({
    id: `launch-${key}`,
    value: form[key],
    maxLength: max,
    disabled: !form.agent,
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
    onBlur: () => touch(key as FieldKey),
    "aria-invalid": showsError(key) ? (true as const) : undefined,
    "aria-describedby": `launch-${key}-error`,
    autoComplete: "off",
  });
  const lead = { tactical: a.leadTactical, hype: a.leadHype, analytical: a.leadAnalytical, meme: a.leadMeme }[form.voice];
  const lockFact = view.locks ? fmt(form.lock === "time" ? a.factTime : a.factLinear, { share: form.share, days: view.lock.days }) : a.factUnlocked;
  const feeFact = fmt(a.factFees, { crew: bpsText(form.crew), creator: bpsText(view.creator) });
  const pills: [string, string][] = [
    [a.pillLock, view.locks ? `${form.share}%` : a.pillUnlocked],
    [t.launch.economics.crew, bpsText(form.crew)],
    [t.launch.economics.creator, bpsText(view.creator)],
  ];
  const name = form.agentName.trim() || t.launch.steps.agent;
  return (
    <StepCard
      id="step-4"
      number="04"
      tone="agent"
      title={t.launch.steps.agent}
      subtitle={a.subtitle}
      hiddenOnPhone={hiddenOnPhone}
      aside={
        <label className="relative flex flex-none cursor-pointer items-center gap-2 text-[12px] text-text-3">
          {a.enabled}
          <input type="checkbox" role="switch" checked={form.agent} onChange={(event) => set("agent", event.target.checked)} className="peer absolute inset-0 z-[1] size-full cursor-pointer opacity-0" />
          <span
            aria-hidden="true"
            className="relative block h-[18px] w-8 rounded-full border border-line-strong bg-raised transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cta before:absolute before:top-[3px] before:left-[3px] before:size-2.5 before:rounded-full before:bg-text-3 before:transition-transform peer-checked:before:translate-x-[13px] peer-checked:before:bg-on-cta"
          />
        </label>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className={cn(!form.agent && "opacity-45")}>
          <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
            <Field id="launch-agentName" label={a.name} error={error("agentName")}>
              <input {...field("agentName", LIMITS.agentName)} className={INPUT} />
            </Field>
            <Field id="launch-agentRole" label={a.role} error={error("agentRole")}>
              <input {...field("agentRole", LIMITS.agentRole)} className={INPUT} />
            </Field>
          </div>
          <Field id="launch-agentBrief" label={a.brief} count={`${form.agentBrief.length}/${LIMITS.agentBrief}`} error={error("agentBrief")}>
            <textarea {...field("agentBrief", LIMITS.agentBrief)} rows={5} className={`${INPUT} min-h-[135px] resize-y`} />
          </Field>
          <span id="launch-voice-label" className="mt-4 mb-2 block text-[12px] text-text-3">
            {a.voice}
          </span>
          <div role="group" aria-labelledby="launch-voice-label" className="flex flex-wrap gap-1.5">
            {AGENT_VOICES.map((voice) => (
              <button
                key={voice}
                type="button"
                aria-pressed={form.voice === voice}
                disabled={!form.agent}
                onClick={() => set("voice", voice)}
                className="min-h-9 rounded-full border border-line-strong px-3 text-[12px] text-text-3 aria-pressed:border-accent aria-pressed:bg-accent/8 aria-pressed:text-accent-text disabled:cursor-not-allowed"
              >
                {a[voice]}
              </button>
            ))}
          </div>
        </div>
        {form.agent ? (
          <div className="self-start rounded-xl border border-line bg-bg p-3.5">
            <div className="mb-5 flex items-center gap-2">
              <TokenTile form={form} size={32} className="h-8 w-[30px] flex-none rounded-lg" letterClassName="text-[19px]" />
              <div className="min-w-0 flex-auto">
                <strong className="block text-[12px] font-medium [overflow-wrap:anywhere]">{name}</strong>
                <small className="mt-0.5 block text-[10px] text-text-3">
                  {a[form.voice]} · {a.sample}
                </small>
              </div>
              <Bot size={13} strokeWidth={2} className="flex-none text-accent-text" aria-hidden="true" />
            </div>
            <p className="m-0 ml-auto w-max max-w-full rounded-lg rounded-br-none border border-accent/15 bg-accent/8 px-2.5 py-2 text-[12px]">{a.question}</p>
            <div className="mt-2.5 rounded-lg rounded-bl-none border border-line bg-raised p-3">
              <p className="m-0 text-[12px] leading-[1.8] text-text-2">
                {lead} {lockFact} {feeFact}
              </p>
              <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
                {pills.map(([label, value]) => (
                  <li key={label} className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text-3">
                    {label}: <strong className="font-medium text-accent-text">{value}</strong>
                  </li>
                ))}
                <li className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text-3">{a.pillPair}</li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-accent/16 bg-accent/4 px-3.5 py-3">
        <Bot size={17} strokeWidth={1.8} className="mt-0.5 flex-none text-accent-text" aria-hidden="true" />
        <p className="m-0 text-[12px] leading-[1.7] text-text-2">
          {form.agent ? a.stored : a.offNote}
          <span className="block text-[11px] text-text-3">{a.previewNote}</span>
        </p>
      </div>
    </StepCard>
  );
}
