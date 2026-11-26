import { domainToASCII, domainToUnicode } from "node:url";
import { isLocale, type Locale } from "@/shared/i18n/config";

/**
 * Readers for the community's environment values. Each takes the raw value
 * and a list to push notes on; a note names the variable and what it
 * expects, never the value (a secret pasted into the wrong variable must not
 * reach the logs).
 */

export const text = (value: string | undefined): string | null => {
  const v = value?.trim();
  return v ? v : null;
};

const entries = (value: string | null): string[] => (value ?? "").split(",").map((p) => p.trim()).filter(Boolean);

/** Comma-separated integers matching `pattern`, as safe numbers, each once; anything else is noted. */
export function ids(value: string | null, name: string, pattern: RegExp, expects: string, notes: string[]): number[] {
  const out: number[] = [];
  for (const part of entries(value)) {
    const n = Number(part);
    if (pattern.test(part) && Number.isSafeInteger(n) && n !== 0) {
      if (!out.includes(n)) out.push(n);
    } else notes.push(`${name}: ignored an entry that isn't ${expects}`);
  }
  return out;
}

/** on or off (also true/false, yes/no, 1/0); unset is `fallback`, anything else off, with a note. */
export function flag(value: string | null, name: string, fallback: boolean, notes: string[]): boolean {
  if (value === null) return fallback;
  const v = value.toLowerCase();
  if (["on", "true", "yes", "1"].includes(v)) return true;
  if (["off", "false", "no", "0"].includes(v)) return false;
  notes.push(`${name} ignored (on or off): off until it is fixed`);
  return false;
}

/** One of `options` (any case); unset or anything else is `fallback`, the latter with a note. */
export function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T, name: string, notes: string[]): T {
  if (value === null) return fallback;
  const found = options.find((o) => o === value.toLowerCase());
  if (!found) notes.push(`${name} ignored (one of ${options.join(", ")})`);
  return found ?? fallback;
}

/** One of the site's language codes; unset or anything else is English, the latter with a note. */
export function locale(value: string | null, name: string, notes: string[]): Locale {
  if (value === null) return "en";
  const v = value.toLowerCase();
  if (isLocale(v)) return v;
  notes.push(`${name} ignored (one of the site's language codes)`);
  return "en";
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Their links follow their own rules (invite links; the official X accounts' own paths), so they can't be allowed whole. */
const OWN_RULES = ["t.me", "telegram.me", "telegram.dog", "x.com", "twitter.com"];

/**
 * Host names as the link rules compare them: lower case, in Unicode form,
 * without "www.". Only a bare host is taken (no scheme, path, port, IP
 * address or single label), and never Telegram's or X's.
 */
export function domains(value: string | null, name: string, notes: string[]): string[] {
  const out: string[] = [];
  for (const part of entries(value)) {
    const ascii = /^[^\s/:?#@\\[\]]+$/.test(part) ? domainToASCII(part.toLowerCase().replace(/\.$/, "")) : "";
    const labels = ascii.split(".");
    const ok = ascii.length <= 253 && labels.length >= 2 && labels.every((l) => LABEL.test(l)) && /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1]);
    const host = ok ? domainToUnicode(ascii).replace(/^www\./, "") : "";
    if (OWN_RULES.some((own) => host === own || host.endsWith(`.${own}`))) notes.push(`${name}: ignored a Telegram or X host (their links follow their own rules)`);
    else if (!host.includes(".")) notes.push(`${name}: ignored an entry that isn't a host name such as example.com`);
    else if (!out.includes(host)) out.push(host);
  }
  return out;
}

/** Usernames matching `pattern` once a leading @ is dropped, lower-cased, each once; anything else is noted. */
export function handles(value: string | null, name: string, pattern: RegExp, expects: string, notes: string[]): string[] {
  const out: string[] = [];
  for (const part of entries(value)) {
    const handle = part.replace(/^@/, "");
    if (pattern.test(handle)) {
      if (!out.includes(handle.toLowerCase())) out.push(handle.toLowerCase());
    } else notes.push(`${name}: ignored an entry that isn't ${expects}`);
  }
  return out;
}

/** An https address without a user or password, or `fallback` with a note. */
export function httpsUrl(value: string | null, name: string, fallback: string, notes: string[]): string {
  if (value === null) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")) return url.href;
  } catch {
    // Not a URL: noted below.
  }
  notes.push(`${name} ignored (an https address)`);
  return fallback;
}

/** A dollar amount from 0 to 1000; unset is `fallback`. Anything else turns AI off (0) with a note: a kill switch must never fail open. */
export function dollars(value: string | null, name: string, fallback: number, notes: string[]): number {
  if (value === null) return fallback;
  const n = /^\d{1,4}(?:\.\d{1,4})?$/.test(value) ? Number(value) : Number.NaN;
  if (n >= 0 && n <= 1000) return n;
  notes.push(`${name} ignored (a number of dollars from 0 to 1000): AI is off until it is fixed`);
  return 0;
}
