"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { CurveSettings } from "@/shared/tonk/curve";
import { draftKey, restoreDraft } from "../lib/draft";
import { defaultForm, effective, type LaunchForm, normalize, type Notice } from "../lib/form";
import { type FieldKey, type Issues, issuesIn, validate } from "../lib/validate";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};
const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the form still works for this visit.
  }
  for (const listener of listeners) listener();
};

export interface LaunchFormState {
  form: LaunchForm;
  /** Changes one field (and any `also` that go with it), then brings the rest back inside the launchpad's rules. */
  set: <K extends keyof LaunchForm>(key: K, value: LaunchForm[K], also?: Partial<LaunchForm>) => void;
  /** What the rules hold back right now (no lock without a dev buy, Creator Rewards above the lock's tier), then what the last change adjusted. */
  notices: Notice[];
  issues: Issues;
  /** A field's error, once it has been shown (after leaving the field, or a failed check). */
  showsError: (key: FieldKey) => boolean;
  touch: (key: FieldKey) => void;
  /** Shows every error in a step (or all); true when there is none. */
  check: (step: 1 | 2 | 3 | 4 | "all") => boolean;
  draft: "none" | "saved" | "unsaved";
  save: () => void;
  reset: () => void;
}

/**
 * The Creator Studio's form. It opens on the draft saved on this device, if
 * any (the server render and first paint show the defaults), and nothing is
 * saved until the creator asks. The lock and Creator Rewards stay as chosen:
 * the launch gets what `effective` derives from them.
 */
export function useLaunchForm(settings: CurveSettings, chainId: number): LaunchFormState {
  const key = draftKey(chainId);
  const stored = useSyncExternalStore(subscribe, () => readStored(key), () => null);
  const [edited, setEdited] = useState<LaunchForm | null>(null);
  const [changed, setChanged] = useState<Notice[]>([]);
  const [shown, setShown] = useState<ReadonlySet<FieldKey>>(new Set());

  const restored = useMemo(() => restoreDraft(stored, settings), [stored, settings]);
  const form = edited ?? restored ?? defaultForm(settings);
  const issues = useMemo(() => validate(form, settings), [form, settings]);
  const notices = useMemo(() => [...effective(form, settings).notices, ...changed], [form, settings, changed]);

  const set = useCallback(
    <K extends keyof LaunchForm>(field: K, value: LaunchForm[K], also: Partial<LaunchForm> = {}) => {
      const result = normalize({ ...form, ...also, [field]: value }, settings, field);
      setEdited(result.form);
      setChanged(result.notices);
    },
    [form, settings],
  );
  const touch = useCallback((field: FieldKey) => setShown((prev) => (prev.has(field) ? prev : new Set(prev).add(field))), []);
  const check = useCallback(
    (step: 1 | 2 | 3 | 4 | "all") => {
      const wrong = issuesIn(issues, step);
      if (wrong.length) setShown((prev) => new Set([...prev, ...wrong]));
      return wrong.length === 0;
    },
    [issues],
  );
  const serialized = JSON.stringify(form);
  return {
    form,
    set,
    notices,
    issues,
    showsError: (field) => shown.has(field) && issues[field] === true,
    touch,
    check,
    // Compared with the draft as it came back (an old draft gains new fields, and a length is settled), not the raw text.
    draft: restored && JSON.stringify(restored) === serialized ? "saved" : edited ? "unsaved" : "none",
    save: () => writeStored(key, serialized),
    reset: () => {
      writeStored(key, null);
      setEdited(null);
      setChanged([]);
      setShown(new Set());
    },
  };
}
