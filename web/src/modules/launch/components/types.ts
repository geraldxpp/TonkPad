import type { CurveSettings } from "@/shared/tonk/curve";
import type { LaunchFormState } from "../hooks/useLaunchForm";
import type { LaunchView } from "../lib/view";

/** What every card of the studio is given. */
export interface StudioProps {
  state: LaunchFormState;
  view: LaunchView;
  settings: CurveSettings;
  /** What amounts are counted in: "ETH" or "test ETH". */
  unit: string;
}

/** The letter a token shows until it has art: its name's first, else its ticker's, else T. */
export const tokenLetter = (form: { name: string; ticker: string }) => (form.name.trim()[0] ?? form.ticker.trim()[0] ?? "T").toUpperCase();

/** A small letter tile: the art's teal with pale ink, the same in both themes. */
export const LETTER_TILE = "flex flex-none items-center justify-center font-display leading-none font-extrabold text-art-ink [background:var(--art-tile)]";

/** The pair as the screen names it: "$ASTRO / ETH" (the ticker isn't translated). */
export const pairText = (ticker: string) => `$${ticker.trim() || "TOKEN"} / ETH`;
