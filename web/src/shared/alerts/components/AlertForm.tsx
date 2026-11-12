"use client";

import { type FormEvent, useId, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { Button } from "@/shared/ui/Button";
import { Segmented } from "@/shared/ui/Segmented";
import { Sheet } from "@/shared/ui/Sheet";
import { levelValid } from "../check";
import { levelText } from "../describe";
import { addRule } from "../hooks";
import { newId } from "../storage";
import type { AlertDirection, AlertToken, AlertWindow, LevelKind } from "../types";

type FormKind = LevelKind | "move";

/** A suggested level a step past the figure now, to three significant digits (never in exponent form). */
function suggest(kind: FormKind, direction: AlertDirection, price: number, cap: number): string {
  if (kind === "move") return "20";
  const base = kind === "price" ? price : cap;
  const step = kind === "price" ? (direction === "above" ? 1.2 : 0.8) : direction === "above" ? 1.5 : 0.7;
  return (base * step).toLocaleString("en-US", { maximumSignificantDigits: 3, useGrouping: false });
}

const parse = (text: string) => Number(text.replace(/[,\s$]/g, ""));

interface AlertFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  token: AlertToken;
  priceUsd: number;
  marketCap: number;
}

/** "Alert me when…": price or market cap past a level, or a move within an hour or a day. */
export function AlertForm({ open, onClose, onSaved, token, priceUsd, marketCap }: AlertFormProps) {
  const { t } = useI18n();
  const a = t.alerts;
  const f = a.form;
  const inputId = useId();
  const [kind, setKind] = useState<FormKind>("price");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [period, setPeriod] = useState<AlertWindow>("1h");
  const [value, setValue] = useState(() => suggest("price", "above", priceUsd, marketCap));
  const [error, setError] = useState<string | null>(null);

  const choose = (nextKind: FormKind, nextDirection: AlertDirection) => {
    setKind(nextKind);
    setDirection(nextDirection);
    setValue(suggest(nextKind, nextDirection, priceUsd, marketCap));
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = parse(value);
    const base = { id: newId(), token, on: true, armed: true, createdAt: Date.now() };
    if (kind === "move") {
      if (!(n >= 1 && n <= 1_000)) return setError(f.percentError);
      if (!addRule({ ...base, kind, window: period, percent: n })) return setError(f.full);
    } else {
      if (!(n > 0)) return setError(f.valueError);
      if (!levelValid(direction, n, kind === "price" ? priceUsd : marketCap)) return setError(direction === "above" ? f.aboveError : f.belowError);
      if (!addRule({ ...base, kind, direction, value: n })) return setError(f.full);
    }
    setError(null);
    onSaved();
  };

  const symbol = token.symbol || token.name;
  return (
    <Sheet open={open} onClose={onClose} title={f.title} subtitle={fmt(f.now, { symbol, price: levelText("price", priceUsd), cap: levelText("mcap", marketCap) })}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Segmented
          label={f.kind}
          size="sm"
          fill
          value={kind}
          onChange={(next) => choose(next, direction)}
          options={[
            { id: "price", label: f.price },
            { id: "mcap", label: f.mcap },
            { id: "move", label: f.move },
          ]}
        />
        {kind === "move" ? (
          <Segmented
            label={f.window}
            size="sm"
            fill
            value={period}
            onChange={setPeriod}
            options={[
              { id: "1h", label: f.within1h },
              { id: "24h", label: f.within24h },
            ]}
          />
        ) : (
          <Segmented
            label={f.direction}
            size="sm"
            fill
            value={direction}
            onChange={(next) => choose(kind, next)}
            options={[
              { id: "above", label: f.above },
              { id: "below", label: f.below },
            ]}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[12px] font-semibold text-text-2">
            {kind === "move" ? f.percent : f.value}
          </label>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, 32))}
            aria-invalid={error !== null}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="h-11 rounded-xl border border-line bg-raised px-3.5 font-mono text-[15px] text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
          />
          {error ? (
            <p id={`${inputId}-error`} role="alert" className="m-0 text-[12px] text-neg">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="cta">
          {f.save}
        </Button>
      </form>
    </Sheet>
  );
}
