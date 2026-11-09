import type { ScoreLevel } from "@/shared/types/token";

/** Mission score colours from CLAUDE.md (the reference's LVL table), as theme tints. */
export const SCORE_LEVELS: Record<ScoreLevel, string> = {
  Safe: "text-pos bg-pos/12",
  Caution: "text-warn bg-warn/13",
  Risky: "text-neg bg-neg/12",
};
