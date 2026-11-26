import { applyDecision, type ModDecision, type ModDeps, type ModTarget } from "../mod/actions";
import { dmRequestOf } from "../mod/rules-scan";
import type { ChatId, Markers, Strictness } from "./types";

/**
 * A member asking to be messaged for help (prompts/15-community-agent.md,
 * "DM me" and fake support: "admins, DM me", "my launch is stuck, can
 * someone DM me"): the message is kept, with no offence, and answered with
 * the fixed DM-safety warning, paced per group (the same pace as the
 * answers' and Haiku's warning when the caller shares it), so scammers who
 * DM first find members warned. Haiku's check escalates it when it needs a
 * person. Never in observe mode, and never when the rules' own decision
 * already warned or removed the message.
 */

/** Without a shared pace, a group's warning is posted at most once in this long. */
const PACE_MS = 30 * 60_000;
const QUIET: ModDecision = { actions: [], category: "fake_support", source: "rule", offence: "none", notice: "dm_warning", alert: null, observeOnly: false, aiGuess: null };

export type DmPace = (chat: ChatId, now: number) => boolean;

export function createDmWarning(mod: ModDeps, shared?: DmPace) {
  const last = new Map<ChatId, number>();
  const own: DmPace = (chat, now) => {
    const at = last.get(chat);
    if (at !== undefined && now - at < PACE_MS) return false;
    last.set(chat, now);
    return true;
  };
  const pace = shared ?? own;

  /** Posts the warning for a kept help request, when the rules' decision `d` neither removed it nor warned already. */
  return function warn(markers: Markers, d: ModDecision | null, target: ModTarget, strictness: Strictness, now: number): void {
    if (!dmRequestOf(markers) || strictness === "observe" || target.user === null) return;
    if (d && (d.actions.some((a) => a.kind === "delete") || d.notice === "dm_warning" || d.notice === "scam_report")) return;
    if (!pace(target.chat, now)) return;
    void applyDecision(QUIET, target, mod);
  };
}
