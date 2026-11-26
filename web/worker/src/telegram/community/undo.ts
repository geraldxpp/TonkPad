import type { AiLimits } from "../claude/types";
import { nameHash } from "../mod/names";
import { pressMatches } from "../press";
import { fill, safeText } from "../text";
import type { TgCallbackQuery, TgMessage } from "../types";
import { type AdminAction, pressData } from "./alerts-buttons";
import { fullName } from "./controls-people";
import { pressLimit, pressReply } from "./controls-press";
import type { CommunityOut } from "./out";
import { LIFTED, MUTED } from "./permissions";
import type { Admins, ChatId, RaidControl, Records, UserId } from "./types";
import { createClaims, editTwice, keyboardWithout, offersUndo } from "./undo-alert";
import { messageHtml } from "./undo-html";
import { ON_MEMBER, ONCE, parsePress, RIGHTS, type UndoPress } from "./undo-press";
import type { CommunityDictionary } from "./words";

export { parsePress, type UndoPress } from "./undo-press";

/** Mute 1 h. */
const MUTE_SECONDS = 3_600;
/**
 * An undo button acts once: a used one stays used for its alert's life (a
 * routine alert is deleted after 47 hours), even when the edit that removes
 * it from the alert was dropped. The claims hold the alert's message ID and
 * what was used, never a member's ID.
 */
const ONCE_MS = 47 * 60 * 60_000;
const CLAIMS_MAX = 10_000;
/** An alert's edit the admin chat's queue dropped is tried once more this much later. */
const EDIT_RETRY_MS = 30_000;

export interface UndoDeps {
  out: CommunityOut;
  records: Records;
  admins: Admins;
  limits: AiLimits;
  raid: RaidControl;
  adminChat: ChatId;
  /** The allow-listed community groups. */
  chats: readonly ChatId[];
  /** The admins' words. */
  words: CommunityDictionary;
  /** A member's current full name, as the rules see it (for trust's name fingerprint), or null when Telegram can't say. */
  nameOf: (chat: ChatId, user: UserId) => Promise<string | null>;
  now: () => number;
}

type AlertMessage = TgMessage & { text: string };

/**
 * The buttons on admin alerts (x:…). A press counts only when its message
 * still shows that button (pressMatches), in the admin chat, for an
 * allow-listed group, from someone within the press limit (checked before
 * any call to Telegram), who holds the action's right in that group now.
 * Every press gets one answer: silent when it goes no further, a toast for a
 * missing right, else whether the action took. Each action is one call:
 * Undo takes back the warning the alert recorded, Unmute sets every
 * permission true and takes back the alert's offence, Unban lifts a ban
 * (only_if_banned), Ban, Trust (with the member's current name fingerprint,
 * any restriction lifted, and the alert's offence taken back while the
 * alert still offers its Undo or Unmute), Delete, Mute 1 h, End raid mode,
 * and Handled, which stamps the admin's name and removes the buttons. Undo,
 * Unmute, Unban and Trust act once per alert, and leave it once they took:
 * a used button stays used for 47 hours even when the edit was dropped,
 * and a dropped edit is tried once more. Trust, Ban, Unmute and Mute 1 h on
 * an alert about an administrator are refused with a toast saying their
 * rights change in Telegram first. The answer always comes before an edit,
 * which waits in the admin chat's queue.
 */
export function createUndo(deps: UndoDeps): { onPress(q: TgCallbackQuery): Promise<boolean> } {
  const { out, records, admins, limits, raid, adminChat, chats, words } = deps;
  const withinLimit = pressLimit(limits);
  const claims = createClaims(ONCE_MS, CLAIMS_MAX);

  /** The right in the alert's group; for an alert about no group, in any of them. */
  async function allowed(p: UndoPress, user: UserId, now: number): Promise<boolean> {
    const right = RIGHTS[p.action];
    if (p.chat !== 0) return admins.can(p.chat, user, right, now);
    for (const chat of chats) if (await admins.can(chat, user, right, now)) return true;
    return false;
  }

  /** Why a press was refused: an anonymous admin can't be tied to a person; anyone else lacks the right. */
  function refusal(p: UndoPress, user: UserId): string {
    const groups = p.chat === 0 ? chats : [p.chat];
    const anonymous = groups.some((chat) => admins.list(chat).some((a) => a.id === user && a.anonymous));
    return anonymous ? words.admin.anonymous : words.admin.noRight;
  }

  async function trust(chat: ChatId, user: UserId, now: number): Promise<boolean> {
    const name = await deps.nameOf(chat, user);
    if (name === null) return false;
    records.trust(chat, user, nameHash(name), now);
    return out.restrict(chat, user, LIFTED, 0);
  }

  /** The alert as it was, its admin's name under it, and no buttons. */
  function handled(q: TgCallbackQuery, m: AlertMessage): void {
    const admin = safeText(fullName(q.from), 64) || safeText(q.from.username ?? "", 32) || String(q.from.id);
    const html = `${messageHtml(m.text, m.entities ?? [])}\n\n${fill(words.admin.handledBy, { admin })}`;
    editTwice(() => out.edit(adminChat, m.message_id, html), EDIT_RETRY_MS);
  }

  /** The alert as it was, without the buttons that were used. */
  function leave(m: AlertMessage, p: UndoPress, used: readonly AdminAction[]): void {
    const drop = new Set(used.map((action) => pressData(action, p.chat, p.target) ?? ""));
    const html = messageHtml(m.text, m.entities ?? []);
    const keyboard = keyboardWithout(m.reply_markup, drop);
    editTwice(() => out.edit(adminChat, m.message_id, html, keyboard), EDIT_RETRY_MS);
  }

  /** One call per action; `offence` says this press holds the alert's offence, which Undo, Unmute and Trust take back once they took. */
  async function act(p: UndoPress, now: number, offence: boolean): Promise<boolean> {
    const { chat, target } = p;
    const takeBack = (done: boolean) => {
      if (done && offence) records.removeOffence(chat, target);
      return done;
    };
    switch (p.action) {
      case "u":
        return takeBack(true);
      case "m":
        return takeBack(await out.restrict(chat, target, LIFTED, 0));
      case "t":
        return takeBack(await trust(chat, target, now));
      case "b0":
        return out.unban(chat, target);
      case "b":
        return out.ban(chat, target);
      case "d":
        out.remove(chat, [target]);
        return true;
      case "q":
        return out.restrict(chat, target, MUTED, Math.floor(now / 1000) + MUTE_SECONDS);
      case "r":
        if (raid.active(chat, now)) raid.end(chat, now);
        return true;
      case "h":
        return true;
    }
  }

  return {
    async onPress(q) {
      if (typeof q.data !== "string" || !q.data.startsWith("x:")) return false;
      // From here the press is the admin chat's: it gets one answer whatever happens, and nothing else acts on it.
      const reply = pressReply(out, q);
      const held: string[] = [];
      let acting = false;
      try {
        const now = deps.now();
        const p = parsePress(q.data);
        const m = q.message;
        if (!p || !m || typeof m.text !== "string" || !pressMatches(q) || m.chat?.id !== adminChat || (p.chat !== 0 && !chats.includes(p.chat))) {
          await reply.say();
          return true;
        }
        const alert: AlertMessage = { ...m, text: m.text };
        if (!(await withinLimit(q, reply, now))) return true;
        const claim = (what: string): boolean => {
          const key = `${m.message_id}:${what}`;
          if (!claims.take(key, now)) return false;
          held.push(key);
          return true;
        };
        const used = ONCE[p.action];
        if (used && !claim(p.action)) {
          await reply.say();
          return true;
        }
        // The alert's offence goes back once: by its Undo, its Unmute, or Trust while it still offers one of them.
        const offence = (p.action === "u" || p.action === "m" || (p.action === "t" && offersUndo(m.reply_markup, p.chat, p.target))) && claim("offence");
        if (!(await allowed(p, q.from.id, now))) {
          await reply.say(refusal(p, q.from.id));
          return true;
        }
        // Telegram restricts and bans no administrator: their rights change in Telegram first, and nothing is recorded here.
        if (ON_MEMBER.has(p.action) && admins.isAdmin(p.chat, p.target)) {
          await reply.say(words.admin.isAdmin);
          return true;
        }
        acting = true;
        const done = await act(p, now, offence);
        await reply.say(done ? words.admin.done : words.check.retry);
        if (!done) return true;
        // It took: the claims stay, and the alert is edited after the answer (the edit waits in the admin chat's queue).
        held.length = 0;
        if (p.action === "h") handled(q, alert);
        else if (used) leave(alert, p, used);
      } catch {
        // A press must never break the update loop. Each action is a single call to Telegram, so the admin can simply try again.
        if (!reply.answered) await reply.say(acting ? words.check.retry : undefined).catch(() => undefined);
      } finally {
        for (const key of held) claims.release(key);
      }
      return true;
    },
  };
}
