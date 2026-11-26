import type { ModAction, OffenceRecord, Strictness } from "../community/types";

/**
 * The ladder (prompts/15-community-agent.md, The ladder, and undo): what a
 * member's offence leads to, by the group's strictness and how many offences
 * still count (7 days after the last).
 *
 *   relaxed  warning · warning · mute 1 h · mute 24 h · ban*
 *   normal   warning · mute 1 h · mute 24 h · ban*
 *   strict   mute 1 h · mute 24 h · ban*
 *
 * * Only when an offence in the window was rule-certain: offences from
 * Haiku's verdicts alone (or other rules that aren't certain) stop at a 24 h
 * mute, and the alert offers Ban.
 */

export const HOUR_S = 3_600;
export const DAY_S = 86_400;

const warn: ModAction = { kind: "warn" };
const mute = (seconds: number): ModAction => ({ kind: "mute", seconds });
const ban: ModAction = { kind: "ban" };

const NORMAL: readonly ModAction[] = [warn, mute(HOUR_S), mute(DAY_S), ban];

const STEPS: Record<Strictness, readonly ModAction[]> = {
  relaxed: [warn, warn, mute(HOUR_S), mute(DAY_S), ban],
  normal: NORMAL,
  strict: [mute(HOUR_S), mute(DAY_S), ban],
  // Observe acts on nothing; what it reports is what normal would do.
  observe: NORMAL,
};

/**
 * The step for a member's latest offence. `offences` already counts it: n is
 * 1 for a first offence, and `certain` includes it when it was rule-certain.
 * Past the last step the last one repeats. A ban needs a rule-certain offence
 * in the window; without one the ladder stops at a 24-hour mute.
 */
export function ladderStep(strictness: Strictness, offences: OffenceRecord): ModAction {
  const steps = STEPS[strictness] ?? NORMAL;
  const n = Number.isFinite(offences.n) ? Math.floor(offences.n) : 1;
  const step = steps[Math.min(Math.max(n, 1), steps.length) - 1];
  if (step.kind === "ban" && !(offences.certain > 0)) return mute(DAY_S);
  return { ...step };
}
