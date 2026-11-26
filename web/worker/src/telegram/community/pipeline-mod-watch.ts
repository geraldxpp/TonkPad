import type { FloodWatch } from "../mod/flood";
import { burstOf } from "../mod/media";
import type { RaidWatch } from "../mod/raid";
import { raidKeysOf, reportOf, severeKeysOf } from "../mod/rules-scan";
import type { TgMessage } from "../types";
import { textOf } from "./pipeline-mod-input";
import { createSpared, LINK_RAID, LINK_RAID_COPY, type RaidCopiesDeps, raidCopies } from "./pipeline-mod-raid";
import type { Who } from "./pipeline-who";
import type { Records, RuleHit, RuleResult } from "./types";

/**
 * The flood and raid watch, for a new message or an edit
 * (prompts/15-community-agent.md, The rules: Flood, Link raid, Edits). A
 * flood adds its hit and its burst, and the rest of a flooding burst is
 * deleted as it comes; an edit never counts as a new message, though it
 * feeds the raid counts for its keys and has a limit of its own. A link raid
 * starts raid mode; only a new member's severe copy makes a raider (the
 * author's earlier copies go with its hit), and other accounts' copies of a
 * punishable raid's link are only deleted. A report counts toward raid mode
 * but is never a raider.
 */

const FLOOD: RuleHit = { category: "flood", severity: "offence", certain: false, detail: "a flood of messages" };

export interface Watched {
  hits: RuleHit[];
  /** The messages to act on: this one, a flood's burst, a raider's own copies. */
  ids: number[];
  /** One of them carries a strong self-harm phrase: its author is never punished. */
  spare: boolean;
  /** This message is the rest of a burst that flooded: delete it too, quietly. */
  rest: boolean;
}

export interface WatchDeps {
  records: Records;
  raid: RaidWatch;
  flood: FloodWatch;
  copies: Omit<RaidCopiesDeps, "spared">;
}

export function createWatch(deps: WatchDeps) {
  const { records, raid, flood } = deps;
  const atRisk = createSpared();
  const copies: RaidCopiesDeps = { ...deps.copies, spared: atRisk.has };

  return function watch(m: TgMessage, who: Who, result: RuleResult, now: number, edit = false): Watched {
    const chat = m.chat.id;
    const hits = [...result.hits];
    const ids = new Set([m.message_id]);
    const strong = result.markers.crisis === "strong";
    const author = who.user ?? who.senderChat;
    if (author === null) return { hits, ids: [...ids], spare: strong, rest: false };
    if (strong) atRisk.add(chat, m.message_id, now);
    const sticker = m.sticker?.file_unique_id ?? m.animation?.file_unique_id ?? null;
    const exempt = reportOf(result.markers);
    const seen = flood.note({
      chat, user: author, messageId: m.message_id, text: textOf(m).text, keys: raidKeysOf(result.markers), severe: severeKeysOf(result.markers), newcomer: who.standing === "new",
      sticker, ...burstOf(m), strictness: records.settings(chat).strictness, exempt, edit, now,
    });
    if (seen.textRaid) raid.noteRaid(chat, "text", now);
    if (seen.linkRaid) {
      // Raid mode first, so the copies' notices are summed up rather than posted one by one.
      raid.noteRaid(chat, "link", now);
      const own = seen.linkRaid.filter((c) => c.user === author);
      const raider = !exempt && own.length > 0;
      if (raider) {
        hits.push(LINK_RAID);
        for (const c of own) ids.add(c.messageId);
      }
      raidCopies(copies, chat, seen.linkRaid.filter((c) => (raider ? c.user !== author : c.messageId !== m.message_id)), now);
      raidCopies(copies, chat, seen.linkOthers.filter((c) => c.messageId !== m.message_id), now, LINK_RAID_COPY);
    }
    if (seen.flood) {
      hits.push(FLOOD);
      for (const id of seen.flood) ids.add(id);
    }
    return { hits, ids: [...ids], spare: strong || [...ids].some((id) => atRisk.has(chat, id)), rest: seen.rest };
  };
}
