import type { PackSource } from "../agent/types";
import type { Me } from "../agent/triggers";
import type { ModDeps } from "../mod/actions";
import { buttonLinks, externalFromOtherChat, forwardName, forwardUsername, riskyFile, viaButtons } from "../mod/media";
import type { RaidWatch } from "../mod/raid";
import { checkMessage, type RuleInput } from "../mod/rules";
import type { TgMessage, TgMessageEntity } from "../types";
import type { Who } from "./pipeline-who";
import type { Admins, AllowList, ChatId, Records, RuleResult } from "./types";

/**
 * What the rules read about one message (mod/rules.ts RuleInput), worked
 * out from the update, the records, Telegram's admin list and the group's
 * own settings, and the rules' result.
 */

export interface RuleInputDeps {
  records: Records;
  admins: Admins;
  raid: Pick<RaidWatch, "active">;
  allow: AllowList;
  pack: PackSource;
  me: () => Me | null;
  /** For getChat (whether members may edit their own tag) and the clock. */
  mod: Pick<ModDeps, "out" | "now">;
}

/** An edit's flags: a new message has neither. */
export interface EditFlags {
  edited: boolean;
  addedLinks: boolean | null;
}

const NEW: EditFlags = { edited: false, addedLinks: null };
/** A group's getChat permissions are read again after this long (telegram-out caches them as long). */
const TAGS_MS = 10 * 60_000;

/** The words of a message (its text, else its caption) and Telegram's markup of them. */
export function textOf(m: TgMessage): { text: string; entities: readonly TgMessageEntity[] } {
  if (typeof m.text === "string") return { text: m.text, entities: Array.isArray(m.entities) ? m.entities : [] };
  if (typeof m.caption === "string") return { text: m.caption, entities: Array.isArray(m.caption_entities) ? m.caption_entities : [] };
  return { text: "", entities: [] };
}

/** How old a message is, by its own date (an edit carries the original's). */
export const ageOf = (m: TgMessage, now: number): number => (Number.isFinite(m.date) ? Math.max(0, Math.floor(now / 1000) - m.date) : 0);

export function createRuleInput(deps: RuleInputDeps): { check(m: TgMessage, who: Who, now: number, edit?: EditFlags): RuleResult } {
  const { records } = deps;
  /** Per group: whether members can't edit their own tag (so a tag is the admins' word), as getChat last said, and when it was asked. */
  const tags = new Map<ChatId, { byAdmins: boolean | undefined; at: number }>();

  /** The last answer, never waited for: until getChat has answered for a group, its tags are taken as the admins' (undefined), so a helper's admin-set "Mod" is never read as a name. */
  function tagsByAdmins(chat: ChatId, now: number): boolean | undefined {
    const known = tags.get(chat);
    if (!known || now - known.at >= TAGS_MS) {
      tags.set(chat, { byAdmins: known?.byAdmins, at: now });
      void deps.mod.out
        .chat(chat)
        .then((full) => {
          const permissions = full?.permissions;
          if (permissions && typeof permissions === "object") tags.set(chat, { byAdmins: permissions.can_edit_tag !== true, at: deps.mod.now() });
        })
        .catch(() => undefined);
    }
    return known?.byAdmins;
  }

  function input(m: TgMessage, who: Who, now: number, edit: EditFlags): RuleInput {
    const { text, entities } = textOf(m);
    const chat = m.chat.id;
    const me = deps.me();
    return {
      text, entities, standing: who.standing, strictness: records.settings(chat).strictness, raid: deps.raid.active(chat, now),
      edited: edit.edited, addedLinks: edit.addedLinks, ageSeconds: ageOf(m, now),
      forwarded: m.forward_origin !== undefined && m.forward_origin !== null, forwardName: forwardName(m), forwardUsername: forwardUsername(m),
      // Link buttons are read like links in the text; the bot's own inline cards and forwards of its messages are never another bot's.
      externalOtherChat: externalFromOtherChat(m), viaButtons: viaButtons(m, me), buttons: buttonLinks(m, me), riskyFile: riskyFile(m),
      sender: { name: who.name, username: who.username, tag: who.tag },
      admins: deps.admins.list(chat).map((a) => ({ name: a.name, username: a.username })),
      bot: me?.usernames ?? [], allow: deps.allow, packAddresses: new Set(deps.pack.current().addresses), trustedName: who.trustedName,
      tagsByAdmins: tagsByAdmins(chat, now),
    };
  }

  return {
    /**
     * The rules' result. An administrator with a title only is moderated as a
     * trusted member, and is also read for fake support ("DM me for
     * support"), which trusted members otherwise skip.
     */
    check(m, who, now, edit = NEW) {
      const base = input(m, who, now, edit);
      const result = checkMessage(base);
      if (who.titled !== true) return result;
      const extra = checkMessage({ ...base, standing: "member" }).hits.filter((h) => h.category === "fake_support");
      return extra.length > 0 ? { ...result, hits: [...result.hits, ...extra] } : result;
    },
  };
}
