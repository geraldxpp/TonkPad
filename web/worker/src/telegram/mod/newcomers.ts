import type { Locale } from "@/shared/i18n/config";
import { LIFTED } from "../community/permissions";
import type { Admins, ChatId, ChatSettings, Newcomers, RaidControl, UserId } from "../community/types";
import type { TgUser } from "../types";
import type { ModDeps } from "./actions";
import { createBoard } from "./newcomers-board";
import { createHeldNotes, type HeldSink, heldOf } from "./newcomers-held";
import { banTwice, createJoinChecks } from "./newcomers-join";
import { createLines, muter } from "./newcomers-lines";
import { createPresses } from "./newcomers-press";
import { createSettle } from "./newcomers-settle";
import { createSteps } from "./newcomers-steps";
import { validUser } from "./newcomers-view";
import { createWelcomes } from "./newcomers-welcome";

/**
 * The new-member check (prompts/15-community-agent.md, The new-member
 * check). A newcomer is restricted as their join arrives, until the check's
 * deadline plus 5 minutes, so a lost state file never leaves anyone muted;
 * their record is written at that moment, so a restart never loses them;
 * and they tap a button to show they're human; joins within 20 seconds
 * share one check. Passed: text only for their first days. Not passed in
 * time, or two wrong taps on the hard check: removed, free to rejoin. A check
 * that can't be posted keeps them restricted while it is tried again, for 30
 * minutes. Someone who comes back still restricted (by the bot, an admin or
 * another bot) keeps that restriction when it outlasts the check's: they are
 * only marked new. Pending checks live in the records until 5 minutes past
 * their deadline, so tick() resolves them after a restart, posted or not.
 * Observe mode and joins older than 5 minutes are only marked new. A group
 * the agent stops running (dropChat) has its checks ended without
 * punishment. Nothing here waits on another newcomer's calls or on a check
 * message's edits: a join, a tap and the tick each return as soon as their
 * own part is done.
 */

/** What mod/names.ts nameRisk reads. */
export interface NameRiskInput {
  name: string;
  username: string | null;
  tag: string | null;
  admins: ReadonlyArray<{ name: string; username: string | null }>;
  bot: readonly string[];
}

export interface NewcomersDeps extends ModDeps {
  admins: Admins;
  /** Bot usernames non-admins may add: lower case, no @. */
  allowedBots: readonly string[];
  /** Raid mode; when it is the RaidWatch, each join counts toward starting it. */
  raid: RaidControl & { noteJoin?: (chat: ChatId, now: number) => void };
  settings: (chat: ChatId) => ChatSettings;
  groupLang: Locale;
  /** The per-person press limit (8 in 10 seconds), checked before any API call. */
  press: (user: UserId, now: number) => boolean;
  /** The groups the agent runs: the tick leaves any other alone. Every group unless given; a group passed to dropChat never again. */
  owns?: (chat: ChatId) => boolean;
  /** A name with a link or handle is removed at once, an impersonating one stays muted: mod/names.ts nameRisk unless another is passed (tests). */
  nameRisk?: (input: NameRiskInput) => "link" | "impersonation" | null;
}

/** The check as the community runs it: members.ts tells it what joiners held, and a group dropped while running ends its checks (community/index-build.ts). */
export interface NewcomerChecks extends Newcomers, HeldSink {
  /** Ends a dropped group's checks without punishment: records dropped, check messages deleted, the check's restriction lifted where the bot still can. */
  dropChat(chat: ChatId): void;
}

const STALE_MS = 5 * 60_000;

export function createNewcomers(deps: NewcomersDeps): NewcomerChecks {
  const { out, records } = deps;
  const strictness = (chat: ChatId) => deps.settings(chat).strictness;
  const lines = createLines(deps.log);
  const mute = muter(lines, out, deps.log);
  const held = createHeldNotes(deps.now);
  const board = createBoard({ ...deps, strictness, extend: (chat, user, until) => void mute(chat, user, until) });
  const welcomes = createWelcomes(deps);
  const steps = createSteps(deps, board, welcomes, lines);
  const markOnly = (chat: ChatId, user: UserId) => {
    const at = deps.now();
    records.markNewcomer(chat, user, at, steps.newcomerUntil(chat, at));
  };
  const settle = createSettle({ out, records, board, lines, held, markOnly, now: deps.now, log: deps.log });
  const joins = createJoinChecks(deps, { board, steps, held, settle, mute });
  const dropped = new Set<ChatId>();
  const runs = (chat: ChatId) => !dropped.has(chat) && (deps.owns?.(chat) ?? true);
  /** Removals queued and not yet made, so a tick while one waits doesn't queue it again (chat, user and check message IDs only). */
  const failing = new Set<string>();

  /** Removes a newcomer from this check in their line, once, unless they are off it by then. */
  function queueFail(chat: ChatId, user: UserId, messageId: number): void {
    const key = `${chat}:${user}:${messageId}`;
    if (failing.has(key)) return;
    failing.add(key);
    void lines(chat, user, () => steps.fail(chat, user, messageId)).finally(() => failing.delete(key));
  }
  const presses = createPresses(deps, board, steps, queueFail);

  const isSelf = (u: TgUser) => !!u.username && u.username.toLowerCase() === deps.bot()?.toLowerCase();

  /** A bot added by someone who isn't an admin, unless it is allowed or an admin itself, is banned, however late the join is seen (observe: reported). */
  function botJoined(chat: ChatId, bot: TgUser, adder: TgUser | null): void {
    if (deps.admins.isAdmin(chat, bot.id)) return;
    const byAdmin = validUser(adder) && !adder.is_bot && deps.admins.isAdmin(chat, adder.id);
    const allowed = !!bot.username && deps.allowedBots.includes(bot.username.toLowerCase());
    if (byAdmin || allowed) return;
    if (strictness(chat) === "observe") void steps.act(chat, bot, "bot_added", [], { observe: true });
    else void steps.act(chat, bot, "bot_added", [{ kind: "ban" }], { out: banTwice(out) });
  }

  return {
    async onJoin(chat, users, adder, joinMessageId, date, now) {
      if (!runs(chat)) return;
      try {
        const joinedAt = Number.isFinite(date) && date > 0 ? Math.min(date * 1_000, now) : now;
        const stale = now - joinedAt > STALE_MS;
        const seen = new Set<UserId>();
        const people: TgUser[] = [];
        for (const u of users) {
          if (!validUser(u) || seen.has(u.id) || isSelf(u)) continue;
          seen.add(u.id);
          if (u.is_bot) botJoined(chat, u, adder);
          else if (!board.has(chat, u.id) && !deps.admins.isAdmin(chat, u.id) && !records.isTrusted(chat, u.id)) {
            if (!stale) deps.raid.noteJoin?.(chat, now);
            people.push(u);
          }
        }
        await joins.joined(chat, people, joinMessageId, joinedAt, stale, now);
      } catch {
        deps.log?.("a join wasn't handled");
      }
    },

    /** What a joiner's chat_member update shows they held: for a joiner already on the check (the joined message came first), or the join that waits for it, or one yet to come. */
    noteHeld(chat, user, member, now) {
      const h = heldOf(member);
      if (!settle.late(chat, user, h)) held.note(chat, user, h, now);
    },

    onPress: (q, now) => presses.onPress(q, now),

    onLeave(chat, user) {
      held.drop(chat, user);
      settle.drop(chat, user);
      const messageId = board.forget(chat, user);
      welcomes.drop(chat, user);
      if (messageId !== null) board.refresh(chat, messageId);
    },

    /** Queues what is due and returns: checks still to post, the restrictions of those waiting for them, the removal of everyone whose time ran out, the welcomes. */
    async tick(now) {
      for (const check of board.retries(now)) if (runs(check.chat)) void steps.post(check);
      board.stretch(now);
      // Posted or not, unless a check this process runs is still trying to go out for them; never in a group no longer run.
      for (const due of records.duePending(now)) if (runs(due.chat) && !board.waits(due.chat, due.user)) queueFail(due.chat, due.user, due.messageId);
      welcomes.tick(now);
      held.prune(now);
      settle.prune(now);
      presses.prune(now);
      board.prune(now);
    },

    dropChat(chat) {
      dropped.add(chat);
      const messages = new Set(board.dropChat(chat));
      const users: UserId[] = [];
      for (const p of records.pendingIn(chat)) {
        users.push(p.user);
        if (p.messageId > 0) messages.add(p.messageId);
        records.dropPending(chat, p.user);
      }
      settle.dropChat(chat);
      welcomes.dropChat(chat);
      if (messages.size > 0) out.remove(chat, [...messages]);
      // Nobody is punished in a group the agent no longer runs: the check's restriction goes, after whatever is under way in their line.
      for (const user of users) {
        void lines(chat, user, async () => {
          if (!(await out.restrict(chat, user, LIFTED, 0))) deps.log?.("a newcomer's restriction wasn't lifted in a dropped group");
        });
      }
    },
  };
}
