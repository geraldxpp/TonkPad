import type { CommunityOut } from "../community/out";
import type { ChatId, Records, UserId } from "../community/types";
import type { Board } from "./newcomers-board";
import { endUnix, type Held, heldOf, type HeldNotes, outlasts } from "./newcomers-held";
import { type Lines, wait, within } from "./newcomers-lines";

/**
 * A joiner whose "joined" message came before their chat_member update, and
 * whose update didn't come within the second the join waited for it. They
 * are restricted and on the check already; what they held before is settled
 * afterwards: by the update when it comes (while they are on the check, or
 * just let in), or by a fresh getChatMember read, in the lane after
 * messages, so it never delays a restriction or a removal. When it outlasts
 * the check's restriction, it is put back with its own permissions and end,
 * they come off the check, and they are only marked new. A read made after
 * the check's own restriction landed shows that one, which never outlasts
 * itself, so only the update can still say more: it is watched for until
 * they leave or are removed, for 2 minutes at most. Holds chat and user IDs
 * only.
 */

const WATCH_MS = 2 * 60_000;
const READ_WAIT_MS = 5_000;
/** A restriction Telegram refused to put back is tried once more, this much later. */
const RESTORE_RETRY_MS = 10_000;

export interface SettleDeps {
  out: Pick<CommunityOut, "member" | "restore">;
  records: Pick<Records, "pending">;
  board: Pick<Board, "forget" | "refresh">;
  lines: Lines;
  held: Pick<HeldNotes, "take">;
  /** Marks a joiner new, and nothing more. */
  markOnly: (chat: ChatId, user: UserId) => void;
  now: () => number;
  log?: (line: string) => void;
}

export interface Settle {
  /** A joiner restricted and put on the check without word of what they held: read fresh now, and watched for their update. */
  watch(chat: ChatId, user: UserId, end: number): void;
  /** An update about a watched joiner (what they held as they joined): true when it was theirs. */
  late(chat: ChatId, user: UserId, held: Held): boolean;
  /** Puts back what a joiner held, in their line, after the check's own restriction (once more 10 seconds later if Telegram refused). */
  restore(chat: ChatId, user: UserId, held: Held): void;
  /** They left or were removed: nothing more is settled for them. */
  drop(chat: ChatId, user: UserId): void;
  dropChat(chat: ChatId): void;
  prune(now: number): void;
}

export function createSettle(deps: SettleDeps): Settle {
  const { out, board } = deps;
  const watched = new Map<string, { end: number; at: number; token: number }>();
  let tokens = 0;
  const key = (chat: ChatId, user: UserId) => `${chat}:${user}`;

  function restore(chat: ChatId, user: UserId, held: Held): void {
    const until = endUnix(held.end);
    void deps.lines(chat, user, async () => {
      if (await out.restore(chat, user, held.permissions, until)) return;
      await wait(RESTORE_RETRY_MS);
      if (!(await out.restore(chat, user, held.permissions, until))) deps.log?.("a newcomer's own restriction wasn't put back");
    });
  }

  /** What they held is known: when it outlasts the check's restriction, it is theirs again and the check lets go of them. */
  function apply(chat: ChatId, user: UserId, held: Held): void {
    const k = key(chat, user);
    const w = watched.get(k);
    if (!w) return;
    watched.delete(k);
    if (!outlasts(held, w.end)) return;
    restore(chat, user, held);
    const messageId = board.forget(chat, user);
    if (messageId !== null) board.refresh(chat, messageId);
    deps.markOnly(chat, user);
  }

  return {
    watch(chat, user, end) {
      const k = key(chat, user);
      const at = deps.now();
      tokens += 1;
      const token = tokens;
      watched.set(k, { end, at, token });
      // Their update came just as the join stopped waiting for it.
      const kept = deps.held.take(chat, user, at);
      if (kept !== undefined) {
        apply(chat, user, kept);
        return;
      }
      void within(out.member(chat, user, { fresh: true }), READ_WAIT_MS, null).then((m) => {
        // Only while they still wait on the check: once let in or removed, a read shows what the check did.
        if (m === null || watched.get(k)?.token !== token || deps.records.pending(chat, user) === null) return;
        const held = heldOf(m);
        if (outlasts(held, end)) apply(chat, user, held);
      });
    },

    late(chat, user, held) {
      if (!watched.has(key(chat, user))) return false;
      apply(chat, user, held);
      return true;
    },

    restore,

    drop: (chat, user) => void watched.delete(key(chat, user)),

    dropChat(chat) {
      for (const k of [...watched.keys()]) if (k.startsWith(`${chat}:`)) watched.delete(k);
    },

    prune(now) {
      for (const [k, w] of watched) if (now - w.at >= WATCH_MS) watched.delete(k);
    },
  };
}
