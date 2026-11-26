import { fmt } from "@/shared/i18n/config";
import type { CommunityOut } from "../community/out";
import { TEXT_ONLY } from "../community/permissions";
import type { ChatId, Decision, PendingCheck, RuleCategory, UserId } from "../community/types";
import type { TgUser } from "../types";
import { applyDecision } from "./actions";
import { DAY_S } from "./ladder";
import { nameRisk as namesRisk } from "./names";
import type { NewcomersDeps } from "./newcomers";
import type { Board, Check } from "./newcomers-board";
import type { Lines } from "./newcomers-lines";
import { DAY_MS, displayName, NEWCOMER_DAYS } from "./newcomers-view";
import type { Welcomes } from "./newcomers-welcome";

/**
 * The check's steps: posting it, removing someone who didn't pass, letting
 * in someone who did, and the moderation and alerts around them. What the
 * records and the check message show changes at once; the newcomer's own
 * Telegram calls wait in their line (newcomers-lines.ts), behind the check's
 * restriction. Every Telegram call reports failure as false or null, so each
 * step logs (without text or IDs) and carries on: a restriction always ends
 * by itself.
 */

export type NameRisk = "link" | "impersonation" | null;

interface ActOptions {
  observe?: boolean;
  messageIds?: number[];
  offence?: Decision["offence"];
  /** Telegram calls for this one decision, when they differ (a bot's ban, tried twice). */
  out?: CommunityOut;
}

export function createSteps(deps: NewcomersDeps, board: Board, welcomes: Welcomes, lines: Lines) {
  const { out, records } = deps;
  const strictness = (chat: ChatId) => deps.settings(chat).strictness;
  const note = (line: string) => deps.log?.(line);
  const newcomerUntil = (chat: ChatId, from: number) => from + NEWCOMER_DAYS[strictness(chat)] * DAY_MS;

  /** A moderation step through mod/actions.ts, so it is counted and alerted like any other; settles when done, never rejects. */
  function act(chat: ChatId, u: TgUser, category: RuleCategory, actions: Decision["actions"], options: ActOptions = {}): Promise<void> {
    const observe = options.observe === true;
    const decision: Decision = { actions, category, source: "rule", offence: options.offence ?? "none", notice: null, alert: observe ? "observe" : "action", observeOnly: observe };
    const target = { chat, user: u.id, senderChat: null, messageIds: options.messageIds ?? [], name: displayName(u), username: u.username ?? null, lang: deps.groupLang, excerpt: "", link: null, ageSeconds: 0 };
    return applyDecision(decision, target, options.out ? { ...deps, out: options.out } : deps);
  }

  /** mod/names.ts's verdict on a newcomer's name (or the one passed in): a link, an impersonation, or nothing. */
  function nameRisk(chat: ChatId, u: TgUser): NameRisk {
    try {
      const bot = deps.bot();
      const admins = deps.admins.list(chat).map((a) => ({ name: a.name, username: a.username }));
      return (deps.nameRisk ?? namesRisk)({ name: displayName(u), username: u.username ?? null, tag: null, admins, bot: bot ? [bot] : [] });
    } catch {
      return null;
    }
  }

  /**
   * For the admins' digest: a newcomer removed after the check (nothing to
   * undo: they may rejoin), one Telegram wouldn't remove, or one let in
   * unchecked (text only) because the check couldn't be posted in 30 minutes.
   */
  function newcomerAlert(chat: ChatId, user: UserId, outcome: "removed" | "stayed" | "unchecked"): void {
    const d = deps.words(deps.adminLang ?? "en");
    const done = outcome === "removed" ? fmt(d.mod.banned, { mentions: d.admin.member, reason: "" }).trim() : outcome === "unchecked" ? d.admin.checkFailed : null;
    deps.alerts.alert({ chat, kind: "action", category: null, member: { id: user, name: "", username: null, since: null }, excerpt: null, link: null, done, aiGuess: null, undo: null, messageId: null, routine: true, urgent: false });
  }

  /** Text only until the newcomer days end (Telegram lifts it by itself), in their line. */
  function textOnly(chat: ChatId, user: UserId, until: number): Promise<void> {
    return lines(chat, user, async () => {
      if (!(await out.restrict(chat, user, TEXT_ONLY, Math.floor(until / 1_000)))) note("a newcomer's text-only days weren't set");
    });
  }

  /**
   * Posts a check (once at a time). One that doesn't go out keeps everyone
   * on it restricted while it is tried again (newcomers-wait.ts); when it
   * still hasn't gone out after 30 minutes, everyone on it is marked new and
   * kept to text only for their newcomer days, never let in with every
   * permission, and the admins hear of it.
   */
  function post(check: Check): Promise<void> {
    if (check.posting) return check.posting;
    const run = (async () => {
      try {
        const result = await board.post(check);
        if (result.kind !== "failed") return;
        const at = deps.now();
        const until = newcomerUntil(check.chat, at);
        for (const w of result.members) {
          records.dropPending(check.chat, w.user);
          records.markNewcomer(check.chat, w.user, at, until);
          newcomerAlert(check.chat, w.user, "unchecked");
          void textOnly(check.chat, w.user, until);
        }
      } catch {
        note("a check wasn't posted");
      } finally {
        // As it settles, so a join right after it never waits on a send that is over.
        check.posting = null;
      }
    })();
    check.posting = run;
    return run;
  }

  /**
   * Removes a newcomer who didn't pass (timed out, or two wrong taps), in
   * their line: unless they are no longer on that check by then (they passed,
   * left, or an admin trusted them). They may rejoin. A record whose check
   * never went out (message ID 0: the process stopped while it waited) is
   * resolved the same way at its deadline.
   */
  async function fail(chat: ChatId, user: UserId, messageId: number): Promise<void> {
    const p = records.pending(chat, user);
    if (!p || p.messageId !== messageId) return;
    board.forget(chat, user);
    board.markDone(chat, user, messageId, deps.now());
    if (p.joinMessageId !== null) out.remove(chat, [p.joinMessageId]);
    board.refresh(chat, messageId);
    const removed = await out.kick(chat, user);
    if (removed) records.count(chat, "kicked", deps.now());
    else note("a newcomer who didn't pass wasn't removed");
    newcomerAlert(chat, user, removed ? "removed" : "stayed");
  }

  /**
   * Lets in a newcomer who tapped right, at once: off the check, marked new,
   * welcomed with the next batch. Then, in their line: text only for their
   * first days; an impersonating name muted for 7 days instead; a name that
   * became a link removed.
   */
  function pass(chat: ChatId, p: PendingCheck, from: TgUser, risk: NameRisk, now: number): void {
    board.forget(chat, p.user);
    board.markDone(chat, p.user, p.messageId, now);
    board.refresh(chat, p.messageId);
    if (risk === "link") {
      void lines(chat, p.user, () => act(chat, from, "name_link", [{ kind: "delete" }, { kind: "kick" }], { messageIds: p.joinMessageId !== null ? [p.joinMessageId] : [] }));
      return;
    }
    const until = newcomerUntil(chat, now);
    records.markNewcomer(chat, p.user, now, until);
    records.count(chat, "passed", now);
    // An impersonator isn't welcomed; their join message still goes with the next welcome.
    welcomes.add(chat, risk === null ? p.user : null, p.joinMessageId, now);
    if (risk === "impersonation") void lines(chat, p.user, () => act(chat, from, "impersonation", [{ kind: "mute", seconds: 7 * DAY_S }], { offence: "model" }));
    else void textOnly(chat, p.user, until);
  }

  return { act, nameRisk, post, fail, pass, newcomerUntil };
}

export type Steps = ReturnType<typeof createSteps>;
