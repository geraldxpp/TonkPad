import { defaultForm, type LaunchForm } from "./form";
import type { CurveSettings } from "@/shared/tonk/curve";

/** Where a draft is kept on this device, per network (the old `tonkpad-` prefix keeps the app's keys in one family). */
export const draftKey = (chainId: number) => `tonkpad-launch-draft:${chainId}`;

const MAX_TEXT = 2_000;

/** A saved draft laid over the defaults: only fields of the right type come back, so an old or edited draft can't break the form. */
export function restoreDraft(saved: string | null, settings: CurveSettings): LaunchForm | null {
  if (!saved) return null;
  try {
    const source: unknown = JSON.parse(saved);
    if (typeof source !== "object" || source === null) return null;
    const form = defaultForm(settings);
    const target = form as unknown as Record<string, unknown>;
    for (const [key, initial] of Object.entries(form)) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof initial === "string" ? typeof value === "string" && value.length <= MAX_TEXT : typeof value === typeof initial && (typeof value !== "number" || Number.isFinite(value))) target[key] = value;
    }
    return form;
  } catch {
    return null;
  }
}
