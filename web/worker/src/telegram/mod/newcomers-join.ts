import type { CommunityOut } from "../community/out";
import type { ChatId, UserId } from "../community/types";
import type { TgUser } from "../types";
import type { NewcomersDeps } from "./newcomers";
import type { Board, Check } from "./newcomers-board";
import { type HeldNotes, outlasts } from "./newcomers-held";
import { wait } from "./newcomers-lines";
import type { Settle } from "./newcomers-settle";
import type { Steps } from "./newcomers-steps";
import { checkMs, pickTarget } from "./newcomers-view";
import { GRACE_MS } from "./newcomers-wait";

/**
 * What happens as people join. Observe mode and late joins: marked new. A
 * name with a link: removed at once. Anyone else is restricted at once, in
 * their own line (never behind other joiners, the check's edits or a
 * Telegram read), until the check's deadline plus 5 minutes; their record is
 * written at that moment (message ID 0 until their check is out), and they
 * go on the shared check, together with whoever joined in the same message.
 * Someone who comes back still restricted, by the bot, an admin or another
 * bot, for longer than the check would restrict them, keeps that
 * restriction, as their chat_member update reports it: no check and no
 * text-only days that would lift it; they are only marked new. When the
 * joined message came first, the join waits up to a second for that update
 * (already restricted), puts back what it shows, and past that second goes
 * on as for anyone else while newcomers-settle.ts learns the rest.
 */

const BAN_RETRY_MS = 10_000;
/** The joined message came first: its chat_member update is waited for this long (members-joins.ts waits as long the other way round). */
export const NOTE_WAIT_MS = 1_000;

/** The same Telegram calls, but a ban Telegram refused (a 429 dropped, a right missing for a moment) is tried once more, 10 seconds later. */
export function banTwice(out: CommunityOut): CommunityOut {
  const twice = Object.create(out) as CommunityOut;
  twice.ban = async (chat, user) => (await out.ban(chat, user)) || wait(BAN_RETRY_MS).then(() => out.ban(chat, user));
  return twice;
}

interface Arriving {
  u: TgUser;
  claim: number;
  /** Their update came first: what they held is known already. */
  noted: boolean;
}

export interface JoinParts {
  board: Board;
  steps: Steps;
  held: HeldNotes;
  settle: Settle;
  /** The check's restriction until `until` (ms), in their line. */
  mute: (chat: ChatId, user: UserId, until: number) => Promise<void>;
}

export function createJoinChecks(deps: NewcomersDeps, parts: JoinParts) {
  const { board, steps, held, settle } = parts;
  const hard = (chat: ChatId, now: number) => deps.settings(chat).strictness === "strict" || deps.raid.active(chat, now);

  /** Marks new only: observe mode (reporting a risky name), a join seen too late to check, or a restriction that outlasts the check's. */
  function markOnly(chat: ChatId, u: TgUser, from: number, observe: boolean): void {
    deps.records.markNewcomer(chat, u.id, from, steps.newcomerUntil(chat, from));
    const risk = observe ? steps.nameRisk(chat, u) : null;
    if (risk) void steps.act(chat, u, risk === "link" ? "name_link" : "impersonation", [], { observe: true });
  }

  /** Settles once each one's restriction is made and the check they wait for has gone out (or will be tried again); never on an edit. */
  async function joined(chat: ChatId, people: readonly TgUser[], joinMessageId: number | null, joinedAt: number, stale: boolean, now: number): Promise<void> {
    if (people.length === 0) return;
    const mode = deps.settings(chat).strictness;
    if (mode === "observe" || stale) {
      for (const u of people) markOnly(chat, u, joinedAt, mode === "observe");
      return;
    }
    const at = deps.now();
    const end = at + (board.open(chat, at)?.durationMs ?? checkMs(mode, hard(chat, at))) + GRACE_MS;
    const work: Array<Promise<void>> = [];
    const arriving: Arriving[] = [];
    for (const u of people) {
      if (steps.nameRisk(chat, u) === "link") {
        void steps.act(chat, u, "name_link", [{ kind: "delete" }, { kind: "kick" }], { messageIds: joinMessageId !== null ? [joinMessageId] : [] });
        continue;
      }
      const noted = held.take(chat, u.id, now);
      // What they hold outlasts the check's restriction: it stays as it is.
      if (noted !== undefined && outlasts(noted, end)) {
        markOnly(chat, u, at, false);
        continue;
      }
      work.push(parts.mute(chat, u.id, end));
      board.arrive(chat, u.id, joinMessageId, end);
      arriving.push({ u, claim: board.claim(chat, u.id), noted: noted !== undefined });
    }
    // Restricted already; the joined message came first for those not noted, so their update may still say what they held.
    const notes = await Promise.all(arriving.map((a) => (a.noted ? undefined : held.wait(chat, a.u.id, NOTE_WAIT_MS))));
    const put = deps.now();
    const touched = new Set<Check>();
    arriving.forEach(({ u, claim, noted }, i) => {
      // Gone again (or the group dropped) while their update was waited for.
      if (!board.claimed(chat, u.id, claim)) return;
      board.release(chat, u.id, claim);
      const note = notes[i];
      if (note !== undefined && outlasts(note, end)) {
        settle.restore(chat, u.id, note);
        board.forget(chat, u.id);
        markOnly(chat, u, put, false);
        return;
      }
      const make = () => ({ target: hard(chat, put) ? pickTarget() : null, durationMs: checkMs(mode, hard(chat, put)), replyTo: joinMessageId });
      const check = board.batch(chat, put, make);
      // Their record went meanwhile (an admin trusted them).
      if (!board.join(check, { user: u.id, joinMessageId }, put)) return;
      if (!noted && note === undefined) settle.watch(chat, u.id, end);
      if (check.messageId === null) touched.add(check);
    });
    // One send per check, naming everyone who joined with this message; one that doesn't go out is tried again by the tick.
    for (const check of touched) work.push(check.posting ?? (check.retryAt === null ? steps.post(check) : Promise.resolve()));
    await Promise.all(work);
  }

  return { joined };
}
