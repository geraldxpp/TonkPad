import type { Locale } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import type { PackSource } from "../agent/types";
import { type Me, topicOf } from "../agent/triggers";
import { applyDecision, type DecideContext, decide, decideBot, type ModDecision, type ModDeps, type ModTarget } from "../mod/actions";
import { noteLeft } from "../mod/actions-left";
import type { EditMemory } from "../mod/edits";
import type { FloodWatch } from "../mod/flood";
import type { RaidWatch } from "../mod/raid";
import { maskForModel } from "../mod/secrets";
import type { TgMessage } from "../types";
import { messageLink } from "./alerts";
import { createDmWarning, type DmPace } from "./pipeline-mod-dm";
import { ageOf, createRuleInput, textOf } from "./pipeline-mod-input";
import { NONE } from "./pipeline-mod-raid";
import { createWatch } from "./pipeline-mod-watch";
import type { Who } from "./pipeline-who";
import type { Admins, AllowList, ChatId, Records, RuleCategory, RuleHit, RuleResult, Standing, UserId } from "./types";

export { ageOf, textOf } from "./pipeline-mod-input";

/**
 * The pipeline's moderation step (prompts/15-community-agent.md,
 * Moderation): the rules on one message, the flood and raid watch, and the
 * rules' own decision, applied at once and never awaited. Haiku's verdict,
 * when one comes, adds to that decision on the same hits
 * (pipeline-triage.ts). Someone who wrote a strong self-harm phrase is never
 * punished, but still moderated: their message counts toward floods and
 * raids (pipeline-mod-watch.ts), and its deletes stand. A member asking to
 * be messaged for help is kept and warned (pipeline-mod-dm.ts).
 */

export interface ModerationDeps {
  records: Records;
  admins: Admins;
  raid: RaidWatch;
  flood: FloodWatch;
  edits: EditMemory;
  /** A person's standing from the admin list and the records (for a raid's other copies). */
  standing: (chat: ChatId, user: UserId, now: number) => Standing;
  mod: ModDeps;
  allow: AllowList;
  pack: PackSource;
  me: () => Me | null;
  /** Public notices are in the group's language. */
  groupLang: Locale;
  /** The group's DM-safety warning pace, shared with the answers' and Haiku's warning (index-build.ts dmWarning); without it, the rules keep their own. */
  dmWarning?: DmPace;
}

/** What phase 1 did, for Haiku's check to add to. */
export interface Moderated {
  hits: RuleHit[];
  ctx: DecideContext;
  target: ModTarget;
  /** The rules' decision deleted the message. */
  removed: boolean;
  /** It was deleted for an unknown link, a new member's link or a brand forward: Haiku decides the offence. */
  removedLink: boolean;
}

const EXCERPT = 300;
/** Never in an alert's excerpt: a secret, a flaw's details, or the contact details removed for privacy. */
const NO_EXCERPT: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "security_report", "contact_info"]);
const LINK_REMOVALS: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["unknown_link", "newcomer_link", "brand_forward"]);
/** The rest of a flooding burst: deleted with it, quietly (no notice, offence or alert of its own). */
const REST: ModDecision = { actions: [{ kind: "delete" }], category: "flood", source: "rule", offence: "none", notice: null, alert: null, observeOnly: false, aiGuess: null };

export function createModeration(deps: ModerationDeps) {
  const { records, raid, flood, mod } = deps;
  const rules = createRuleInput({ records, admins: deps.admins, raid, allow: deps.allow, pack: deps.pack, me: deps.me, mod });
  const check = rules.check;
  const watch = createWatch({ records, raid, flood, copies: { records, standing: deps.standing, mod, groupLang: deps.groupLang } });
  const dmWarning = createDmWarning(mod, deps.dmWarning);

  /** `spare`: a message the decision acts on carries a strong self-harm phrase, so its author is never punished. */
  function contextOf(chat: ChatId, who: Who, now: number, stale: boolean, spare: boolean): DecideContext {
    const offences = who.user !== null ? records.offences(chat, who.user, now) : NONE;
    return { standing: who.standing, strictness: records.settings(chat).strictness, offences, raid: raid.active(chat, now), senderChat: who.senderChat !== null, stale, spare };
  }

  function targetOf(m: TgMessage, who: Who, hits: readonly RuleHit[], messageIds: number[], now: number): ModTarget {
    const chat = m.chat.id;
    const thread = topicOf(m);
    const quiet = hits.some((h) => NO_EXCERPT.has(h.category));
    // Masked first, while Telegram's marks (phone numbers, addresses) still fit the text.
    const { text, entities } = textOf(m);
    return {
      chat, user: who.user, senderChat: who.senderChat, messageIds, thread, name: who.name, username: who.username,
      since: who.user !== null ? records.newcomerSince(chat, who.user, now) : null, lang: deps.groupLang,
      excerpt: quiet ? "" : clip(visibleText(maskForModel(text, entities)), EXCERPT).trim(), link: messageLink(m.chat, m.message_id, thread), ageSeconds: ageOf(m, now), seenAt: now,
    };
  }

  /**
   * The rules' decision, applied without waiting; true when it deleted the
   * message. The rest of a flooding burst (`rest`) is deleted all the same,
   * quietly, except in observe mode.
   */
  function apply(hits: RuleHit[], ctx: DecideContext, target: ModTarget, now: number, rest = false): { moderated: Moderated; decision: ModDecision | null } {
    const d = decide(hits, null, ctx);
    if (d) {
      void applyDecision(d, target, mod);
      if (d.actions.length > 0) raid.noteAction(target.chat, now);
    }
    let removed = d?.actions.some((a) => a.kind === "delete") ?? false;
    if (rest && !removed && ctx.strictness !== "observe") {
      void applyDecision(REST, { ...target, messageIds: target.messageIds.slice(0, 1) }, mod);
      removed = true;
    }
    return { moderated: { hits, ctx, target, removed, removedLink: removed && d !== null && LINK_REMOVALS.has(d.category) }, decision: d };
  }

  return {
    check,

    /** A new message: the flood and raid watch, then the rules' decision (admins are never moderated), and a help request's DM-safety warning. */
    fresh(m: TgMessage, who: Who, result: RuleResult, now: number): Moderated {
      const { hits, ids, spare, rest } = watch(m, who, result, now);
      const ctx = contextOf(m.chat.id, who, now, false, spare);
      const { moderated, decision } = apply(hits, ctx, targetOf(m, who, hits, ids, now), now, rest);
      if (!moderated.removed) dmWarning(result.markers, decision, moderated.target, ctx.strictness, now);
      return moderated;
    },

    /**
     * An edit, checked like a new message: it feeds the raid counts but never
     * counts as a new message toward a flood (more than 10 edits in 10
     * seconds are a flood of their own); an added link is an offence only
     * when the original is remembered; past 47 hours a hit mutes instead of
     * deleting.
     */
    edited(m: TgMessage, who: Who, now: number): { result: RuleResult; moderated: Moderated } {
      let result = check(m, who, now, { edited: true, addedLinks: null });
      if (deps.edits.added(m.chat.id, m.message_id, result.markers.linkKeys, now) === true) result = check(m, who, now, { edited: true, addedLinks: true });
      const { hits, ids, spare } = watch(m, who, result, now, true);
      return { result, moderated: apply(hits, contextOf(m.chat.id, who, now, false, spare), targetOf(m, who, hits, ids, now), now).moderated };
    },

    /**
     * A message (or an edit) that came while the worker was down: the certain
     * rules only, and only deletes, its author spared as ever when it carries
     * a strong self-harm phrase. True when something was deleted.
     */
    stale(m: TgMessage, who: Who, now: number): boolean {
      const edited = m.edit_date !== undefined;
      const { hits, markers } = check(m, who, now, { edited, addedLinks: null });
      const d = decide(hits, null, contextOf(m.chat.id, who, now, true, markers.crisis === "strong"));
      if (!d) return false;
      void applyDecision(d, targetOf(m, who, hits, [m.message_id], now), mod);
      return d.actions.some((a) => a.kind === "delete");
    },

    /**
     * Another bot's message (not an admin, not allowed): the certain rules
     * alone, read as a member's; a hit deletes it and bans the bot. True when
     * it was deleted.
     */
    bot(m: TgMessage, who: Who, now: number, stale: boolean): boolean {
      const asMember: Who = { ...who, standing: "member" };
      const result = check(m, asMember, now, { edited: m.edit_date !== undefined, addedLinks: null });
      // A bot is never spared: a self-harm phrase in its text can't shield its links.
      const d = decideBot(result.hits, contextOf(m.chat.id, asMember, now, stale, false));
      if (!d) return false;
      void applyDecision(d, targetOf(m, asMember, result.hits, [m.message_id], now), mod);
      if (!stale && d.actions.length > 0) raid.noteAction(m.chat.id, now);
      return d.actions.some((a) => a.kind === "delete");
    },

    /** Someone left the group: a late verdict on what they posted before records nothing (mod/actions-left.ts). */
    left(chat: ChatId, user: UserId, now: number): void {
      noteLeft(records, chat, user, now);
    },
  };
}

export type Moderation = ReturnType<typeof createModeration>;
