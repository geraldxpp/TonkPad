import { type BotApi, TelegramError } from "../src/telegram/api";
import type { TgChatMember, TgChatPermissions } from "../src/telegram/types";
import { GROUP } from "./community-fixtures";
import { person } from "./mod-newcomers-setup";

/**
 * A fake Bot API for the new-member check's benches: each call is answered
 * after `latencyMs` on the fake clock and recorded as it was written (so a
 * getter is read then). It keeps each member's place the way Telegram does:
 * a restriction stays across a leave and a rejoin until it ends,
 * restrictChatMember replaces it, unbanChatMember without only_if_banned
 * removes, and getChatMember answers with what is true when the call
 * arrives. New messages are numbered from 701 in the order they were sent.
 */

export interface ApiCall {
  method: string;
  params: Record<string, unknown>;
  at: number;
}

interface Place {
  status: "member" | "left" | "kicked";
  /** A restriction Telegram keeps: its permissions and end (unix seconds; 0 never). */
  restriction: { permissions: TgChatPermissions; until: number } | null;
}

const lifts = (p: TgChatPermissions) => Object.values(p).every((v) => v === true);

export function fakeTelegram(latencyMs: number) {
  const calls: ApiCall[] = [];
  const places = new Map<number, Place>();
  let nextId = 700;
  let lastCheck: number | null = null;
  /** Until this time (ms) every new message is refused with a 429 asking for 30 seconds: longer than a send may wait. */
  let sendsBlockedUntil = 0;
  const place = (user: number): Place => places.get(user) ?? { status: "left", restriction: null };
  const live = (p: Place, nowS: number) => (p.restriction && (p.restriction.until === 0 || p.restriction.until > nowS) ? p.restriction : null);

  /** The member as getChatMember (or a join's update) shows them now. */
  function memberAt(user: number): TgChatMember {
    const p = place(user);
    const r = live(p, Math.floor(Date.now() / 1_000));
    const inside = p.status === "member";
    if (r) return { status: "restricted", is_member: inside, user: person(user), until_date: r.until, ...r.permissions };
    return { status: inside ? "member" : p.status, user: person(user) };
  }

  function apply(method: string, p: Record<string, unknown>): unknown {
    const user = Number(p.user_id);
    switch (method) {
      case "sendMessage": {
        nextId += 1;
        if (String(p.text).includes("Tap the button")) lastCheck = nextId;
        return { message_id: nextId, date: 0, chat: GROUP };
      }
      case "editMessageText":
        return { message_id: p.message_id, date: 0, chat: GROUP };
      case "getChatMember":
        return memberAt(user);
      case "restrictChatMember": {
        const permissions = p.permissions as TgChatPermissions;
        const until = typeof p.until_date === "number" ? p.until_date : 0;
        places.set(user, { ...place(user), restriction: lifts(permissions) ? null : { permissions, until } });
        return true;
      }
      case "unbanChatMember":
        if (p.only_if_banned !== true) places.set(user, { ...place(user), status: "left" });
        else if (place(user).status === "kicked") places.set(user, { ...place(user), status: "left" });
        return true;
      case "banChatMember":
        places.set(user, { ...place(user), status: "kicked" });
        return true;
      default:
        return true;
    }
  }

  const api: BotApi = {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      const written = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
      calls.push({ method, params: written, at: Date.now() });
      if (method === "sendMessage" && Date.now() < sendsBlockedUntil) throw new TelegramError(429, "Too Many Requests: retry after 30", 30);
      // Telegram acts on a call as it arrives, and answers after the round trip.
      const answer = apply(method, written);
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      return answer as T;
    },
  };

  return {
    api,
    calls,
    memberAt,
    lastCheck: () => lastCheck,
    /** They join: in the group, keeping a restriction Telegram kept. */
    join: (user: number) => void places.set(user, { ...place(user), status: "member" }),
    /** They leave, keeping their restriction. */
    leave: (user: number) => void places.set(user, { ...place(user), status: "left" }),
    /** Refuses every new message until `untilMs` (a flood limit Telegram set on the group). */
    blockSends: (untilMs: number) => void (sendsBlockedUntil = untilMs),
    /** Someone else (an admin, another bot) restricts them. */
    restrict: (user: number, permissions: TgChatPermissions, untilS: number) => void places.set(user, { ...place(user), restriction: { permissions, until: untilS } }),
  };
}
