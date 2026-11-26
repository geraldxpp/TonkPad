import { nameHash } from "../mod/names";
import { escapeHtml } from "../text";
import type { TgUser, View } from "../types";
import { fullName, personHtml } from "./controls-people";
import type { CommunityOut } from "./out";
import { LIFTED } from "./permissions";
import type { Admins, ChatId, Records } from "./types";
import type { CommunityDictionary } from "./words";

/** At most this many trusted members are named in /trusted (one message); the rest are counted. */
const LISTED = 25;

export interface MemberControlDeps {
  out: CommunityOut;
  records: Records;
  admins: Admins;
  adminWords: CommunityDictionary;
  now: () => number;
}

/**
 * Trusts a member: the fingerprint of the name they have now is kept (a new
 * name is checked again), a new-member check still waiting for them is
 * dropped so its timeout can't remove them, and any restriction is lifted
 * (every permission true, Telegram's documented way; admins have none).
 */
export async function trustMember(deps: MemberControlDeps, chat: ChatId, user: TgUser): Promise<void> {
  const { out, records } = deps;
  records.trust(chat, user.id, nameHash(fullName(user)), deps.now());
  const check = records.pending(chat, user.id);
  if (check) {
    records.dropPending(chat, user.id);
    if (records.pendingOn(chat, check.messageId).length === 0) out.remove(chat, [check.messageId]);
  }
  if (!deps.admins.isAdmin(chat, user.id)) await out.restrict(chat, user.id, LIFTED, 0);
}

/** A group's trusted members as Telegram names them now (getChatMember, cached), with their IDs, for the admin chat. */
export async function trustedView(deps: MemberControlDeps, chat: ChatId, group: string): Promise<View> {
  const ids = deps.records.trusted(chat);
  const lines = [`<b>${escapeHtml(deps.adminWords.commands.trusted)}</b> · ${group}`];
  for (const id of ids.slice(0, LISTED)) {
    const member = await deps.out.member(chat, id);
    const person = member?.user ? personHtml(member.user) : "";
    lines.push(`• ${person ? `${person} ` : ""}<code>${id}</code>`);
  }
  if (ids.length > LISTED) lines.push(`+${ids.length - LISTED}`);
  if (ids.length === 0) lines.push("—");
  return { text: lines.join("\n") };
}
