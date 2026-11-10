import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/** Why a trade or an action stopped, in words. Codes come from the wallet, the server and the receipt. */
export function runError(t: Dictionary, code: string | null, unit: string): string {
  const e = t.mission.trade.errors;
  switch (code) {
    case "rejected":
      return t.swap.errors.rejected;
    case "network":
      return t.swap.errors.network;
    case "busy":
      return t.swap.errors.busy;
    case "early":
      return e.early;
    case "paused":
      return e.paused;
    case "graduated":
      return e.graduated;
    case "funds":
      return fmt(e.funds, { unit });
    case "tokens":
      return e.tokens;
    case "refused":
      return e.refused;
    case "reverted":
      return e.reverted;
    case "replaced":
      return e.replaced;
    case "forbidden":
      return t.mission.action.forbidden;
    case "nothing":
      return t.mission.action.nothing;
    default:
      return t.swap.errors.unavailable;
  }
}

/** Basis points as the fee line shows them: 100 → "1%", 150 → "1.5%". */
export const bpsPct = (bps: number) => `${bps / 100}%`;
