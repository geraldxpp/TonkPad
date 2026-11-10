"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { CurveSettings } from "@/shared/tonk/curve";
import { draftKey, restoreDraft } from "../lib/draft";
import { defaultForm, type LaunchForm, normalize, type Notice } from "../lib/form";
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
  /** Changes one field, then brings the rest back inside the launchpad's rules. */
  set: <K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) => void;
  /** What the last change adjusted on its own. */
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
 * saved until the creator asks.
 */
export function useLaunchForm(settings: CurveSettings, chainId: number): LaunchFormState {
  const key = draftKey(chainId);
  const stored = useSyncExternalStore(subscribe, () => readStored(key), () => null);
  const [edited, setEdited] = useState<LaunchForm | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [shown, setShown] = useState<ReadonlySet<FieldKey>>(new Set());

  const base = useMemo(() => restoreDraft(stored, settings) ?? defaultForm(settings), [stored, settings]);
  const form = edited ?? base;
  const issues = useMemo(() => validate(form, settings), [form, settings]);

  const set = useCallback(
    <K extends keyof LaunchForm>(field: K, value: LaunchForm[K]) => {
      const result = normalize({ ...form, [field]: value }, settings, field);
      setEdited(result.form);
      setNotices(result.notices);
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
    draft: stored === serialized ? "saved" : edited ? "unsaved" : "none",
    save: () => writeStored(key, serialized),
    reset: () => {
      writeStored(key, null);
      setEdited(null);
      setNotices([]);
      setShown(new Set());
    },
  };
}
