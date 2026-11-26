import { AI_OFF_REASONS, type AiOff } from "../community/types";
import type { CallKind, ClaudeFailure } from "./types";

const MINUTE = 60_000;
const KINDS: readonly CallKind[] = ["answer", "triage"];
/** 5 of these within 5 minutes, in one kind of call, pause that kind for 10 minutes. */
const TRANSIENT: readonly ClaudeFailure[] = ["timeout", "network", "rate_limited", "overloaded", "server", "unknown"];
const BURST = 5;
const BURST_WINDOW = 5 * MINUTE;
const BURST_PAUSE = 10 * MINUTE;
/** A refused or unscoped key pauses every call for an hour; a bad request pauses its kind of call for 15 minutes. */
const AUTH_PAUSE = 60 * MINUTE;
const BAD_REQUEST_PAUSE = 15 * MINUTE;
/** A ramp limit waits Anthropic's retry-after: 10 seconds without one, at most 10 minutes. */
const RAMP_DEFAULT = 10_000;
const RAMP_MAX = 10 * MINUTE;

export type BreakerEvent = "circuit" | "auth" | "bad_request" | "billing" | "not_found" | "restored";
type Stop = Exclude<BreakerEvent, "restored">;
/** The stops one kind of call has on its own. */
const KIND_STOPS: readonly Stop[] = ["circuit", "bad_request"];
/** Why some call can't run: the saved switch's reason, a refused key, a kind's open breaker, or a kind's ramp-limit wait. */
export type BreakerReason = AiOff["reason"] | "auth" | "circuit" | "ramp";

/** What stops model calls after failures, by kind of call, and the saved AI-off switch (claude/budget.ts). */
export interface Breaker {
  /** Whether this kind of call may run now, as far as failures and the switch go. */
  running(kind: CallKind, now: number): boolean;
  reason(now: number): BreakerReason | null;
  /** When the reason's pause ends (ms): null for the switch, or with nothing paused. */
  until(now: number): number | null;
  /** A request of this kind got a reply: AI's return is announced once every stop has passed. */
  replied(kind: CallKind, now: number): void;
  /** One request of this kind failed: a transient failure counts toward its kind's burst, a bad request pauses its kind. */
  attemptFailed(kind: CallKind, failure: ClaudeFailure, now: number): void;
  /**
   * A call's final failure: a refused key, billing or a missing model stops
   * every call; a ramp limit makes the kind of call it came from wait (every
   * kind, when the caller doesn't say which).
   */
  failed(failure: ClaudeFailure, retryAfterMs: number | null, now: number, kind?: CallKind | null): void;
  setOn(on: boolean, now: number): void;
}

const rampWait = (ms: number | null) => (ms !== null && Number.isFinite(ms) && ms > 0 ? Math.min(ms, RAMP_MAX) : RAMP_DEFAULT);

/**
 * The budget's failure handling (prompts/15-community-agent.md, Failures),
 * with one breaker for moderation checks and one for answers, so neither
 * kind's failures pause the other: 5 transient failures of a kind within 5
 * minutes pause that kind for 10, a bad request pauses its kind for 15, and
 * a ramp limit makes its kind wait its retry-after, without a breaker or an
 * alert. A refused or unscoped key pauses every call for an hour; billing or
 * a missing model or workspace turns every call off until an owner's /ai on
 * (saved, so a restart keeps it off). Each stop is announced once per
 * streak, and a pause or a bad request once per streak of its own kind of
 * call (answers#13), with the kind: a checks' pause is said even while an
 * answers' streak is still open. A kind's return is said after its first
 * reply while another stop is still unresolved; AI's return ("restored"
 * without a kind) only after a reply, once nothing is paused any more and
 * each kind of call that stopped has had one. `saveOff` and `emit` must not
 * throw.
 */
export function createBreaker(saved: AiOff | null, saveOff: (v: AiOff | null) => void, emit: (event: BreakerEvent, now: number, kind: CallKind | null) => void): Breaker {
  let off: AiOff | null = saved && AI_OFF_REASONS.includes(saved.reason) ? { reason: saved.reason, since: Number.isFinite(saved.since) ? saved.since : 0 } : null;
  let authUntil = 0;
  const rampUntil: Record<CallKind, number> = { answer: 0, triage: 0 };
  const pausedUntil: Record<CallKind, number> = { answer: 0, triage: 0 };
  const recent: Record<CallKind, number[]> = { answer: [], triage: [] };
  /**
   * Stops announced since AI's return last was, each said once per streak: a
   * stop of every call by its name ("auth", and a saved billing or
   * missing-model stop), a kind's pause or bad request as "<stop>:<kind>".
   */
  const told = new Set<string>(off && off.reason !== "admin" ? [off.reason] : []);
  /** Kinds of call that stopped since then: each needs a reply of its own before AI's return is announced. */
  const troubled = new Set<CallKind>();
  /** A stop was announced, and AI's return hasn't been. */
  let pending = told.size > 0;

  const save = () => saveOff(off ? { ...off } : null);
  /** Off, or paused for a refused key: every call stops. */
  const allStopped = (now: number) => off !== null || authUntil > now;
  const keyOf = (stop: Stop, kind: CallKind | null) => (kind ? `${stop}:${kind}` : stop);
  const say = (stop: Stop, now: number, kind: CallKind | null = null) => {
    pending = true;
    if (told.has(keyOf(stop, kind))) return;
    told.add(keyOf(stop, kind));
    emit(stop, now, kind);
  };
  /** Pauses one kind of call; said unless every call is stopped anyway (a request still in flight failing late). */
  const pause = (kind: CallKind, ms: number, stop: Stop, now: number) => {
    const quiet = allStopped(now);
    pausedUntil[kind] = Math.max(pausedUntil[kind], now + ms);
    troubled.add(kind);
    if (!quiet) say(stop, now, kind);
  };
  /** Ends a kind's streak: its next pause or bad request is said again. True when one of them had been said. */
  const resolve = (kind: CallKind): boolean => {
    let said = false;
    for (const stop of KIND_STOPS) said = told.delete(keyOf(stop, kind)) || said;
    return said;
  };
  /** AI's return, once a stop was said and nothing is paused or stopped any more. */
  const restore = (now: number) => {
    if (!pending || troubled.size > 0 || allStopped(now)) return;
    pending = false;
    told.clear();
    emit("restored", now, null);
  };
  const reason = (now: number): BreakerReason | null => {
    if (off) return off.reason;
    if (authUntil > now) return "auth";
    if (KINDS.some((k) => pausedUntil[k] > now)) return "circuit";
    return KINDS.some((k) => rampUntil[k] > now) ? "ramp" : null;
  };

  return {
    running: (kind, now) => !allStopped(now) && pausedUntil[kind] <= now && rampUntil[kind] <= now,
    reason,
    until(now) {
      const why = reason(now);
      if (why === "auth") return authUntil;
      if (why === "circuit") return Math.max(...KINDS.map((k) => pausedUntil[k]));
      return why === "ramp" ? Math.max(...KINDS.map((k) => rampUntil[k])) : null;
    },

    replied(kind, now) {
      // A reply sent before its kind's breaker opened proves nothing about it; a kind still paused stays troubled.
      if (pausedUntil[kind] > now || !troubled.delete(kind)) return void restore(now);
      const said = resolve(kind);
      if (allStopped(now)) return;
      if (troubled.size === 0) return void restore(now);
      // The other kind is still unresolved: this kind's return is said on its own.
      if (said) emit("restored", now, kind);
    },

    attemptFailed(kind, failure, now) {
      if (failure === "bad_request") return pause(kind, BAD_REQUEST_PAUSE, "bad_request", now);
      if (!TRANSIENT.includes(failure)) return;
      recent[kind] = [...recent[kind].filter((at) => now - at < BURST_WINDOW), now];
      if (recent[kind].length < BURST) return;
      recent[kind] = [];
      pause(kind, BURST_PAUSE, "circuit", now);
    },

    failed(failure, retryAfterMs, now, kind = null) {
      if (failure === "billing" || failure === "not_found") {
        if (off !== null) return;
        off = { reason: failure, since: now };
        save();
        say(failure, now);
      } else if (failure === "auth") {
        const quiet = off !== null;
        authUntil = Math.max(authUntil, now + AUTH_PAUSE);
        if (!quiet) say("auth", now);
      } else if (failure === "ramp") {
        const end = now + rampWait(retryAfterMs);
        for (const k of kind ? [kind] : KINDS) rampUntil[k] = Math.max(rampUntil[k], end);
      }
    },

    /** Off is saved as an owner's ("admin"); on clears any saved reason. Either replaces a billing or missing-model stop, which is said again if it comes back. */
    setOn(on, now) {
      if (on ? off === null : off?.reason === "admin") return;
      if (off && off.reason !== "admin") told.delete(off.reason);
      off = on ? null : { reason: "admin", since: now };
      save();
    },
  };
}
