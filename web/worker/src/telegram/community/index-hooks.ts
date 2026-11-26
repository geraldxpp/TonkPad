import type { PackSource } from "../agent/types";
import type { AiLimits, Budget, BudgetStatus, ClaudeClient } from "../claude/types";
import { isCommunityPress, pressMatches, updateChat } from "../press";
import type { TgCallbackQuery, TgChatMemberUpdated } from "../types";
import type { Community } from "./index-build";
import { startDeleter } from "./index-deleter";
import { startTimers } from "./index-hooks-tick";
import { inChat } from "./members-joins";
import type { CommunityOut } from "./out";
import type { Admins, AlertSink, ChatId, CommunityHooks, Records } from "./types";

/**
 * The community agent as the router sees it (CommunityHooks), with its
 * timers (index-hooks-tick.ts). It can be turned off after start, when a
 * setup check Telegram couldn't answer at first fails for certain: from
 * then on it owns no chat, offers no AI, and the router treats every
 * update as module 14's; only the deletes it scheduled keep going
 * (index-deleter.ts).
 */

export interface HooksInput {
  community: Community;
  out: CommunityOut & { tick(now: number): Promise<void>; stop(): void };
  records: Records;
  /** community.json; deletesLeft, when given, lets the deletes outlive a turn-off until none is left. */
  store: { save(): Promise<void>; stop(): void; deletesLeft?(): number };
  admins: Admins & { known?(chat: ChatId): boolean };
  limits: AiLimits;
  client: ClaudeClient | null;
  budget: Budget | null;
  pack: PackSource;
  alerts: (AlertSink & { tick(now: number): Promise<void>; prune?(now: number): void }) | null;
  watch: { tick(now: number): Promise<void> } | null;
  /** The setup checks still unanswered (setup-retry.ts), or null. */
  setup?: { tick(now: number): Promise<void> } | null;
  adminChat: ChatId | null;
  /** Whether the admin chat passed its checks (always, unless given): until then it isn't the community's. */
  adminReady?: () => boolean;
  privateAi: boolean;
  /** Reads the bot's own rights in each group again, for /status. */
  readRights: () => Promise<void>;
  /** Hears that community mode turned off after start, so the menus are set again. */
  onChange?: () => void;
  now: () => number;
  log: (line: string) => void;
}

/** What a budget may say while AI answers are still offered (asking then says they're paused): nothing, the day's cap, the breaker after errors, a ramp limit's wait. */
const OFFERED: ReadonlySet<BudgetStatus["reason"]> = new Set<BudgetStatus["reason"]>([null, "cap", "circuit", "ramp"]);

export function startHooks(input: HooksInput): CommunityHooks & { disable(why: string): Promise<void> } {
  const { community: c, out, now, log } = input;
  let off = false;
  const timers = startTimers({ ...input, setup: input.setup ?? null });
  let deleter: { stop(): void } | null = null;

  const owns = (chat: ChatId) => !off && c.owns(chat);
  const isAdminChat = (chat: ChatId) => !off && input.adminChat !== null && chat === input.adminChat && input.adminReady?.() !== false;
  /** AI can run: a client, a budget, and no stop that hides it (an owner's /ai off, billing, a missing model, a refused key, a budget of 0). */
  const usable = () => !off && input.client !== null && input.budget !== null && OFFERED.has(input.budget.status(now()).reason);

  /** A community press, already checked with pressMatches by the router (and again here): each to its owner. */
  async function onPress(q: TgCallbackQuery): Promise<boolean> {
    if (off || !isCommunityPress(q.data)) return false;
    try {
      if (!pressMatches(q)) return true;
      const data = q.data ?? "";
      if (data.startsWith("h:")) {
        const chat = q.message?.chat.id;
        return chat !== undefined && c.owns(chat) ? await c.newcomers.onPress(q, now()) : true;
      }
      if (data.startsWith("x:")) return c.undo ? await c.undo.onPress(q) : true;
      if (data.startsWith("p:")) return c.controls ? await c.controls.onPress(q) : true;
      if (data.startsWith("ap:")) return c.appeals ? await c.appeals.onPress(q) : true;
      return await c.qa.onPress(q);
    } catch {
      log("a community press wasn't handled");
      return true;
    }
  }

  /** Off, as the router is without the community agent: where the bot was added, by group ID only. */
  async function noteAdded(u: TgChatMemberUpdated): Promise<void> {
    if (!inChat(u.old_chat_member) && inChat(u.new_chat_member)) log(`added to group ${u.chat.id} (${u.chat.type})`);
  }

  const no = () => Promise.resolve(false);
  return {
    owns,
    isAdminChat,
    priority: (u) => {
      const chat = updateChat(u);
      return chat !== null && (owns(chat) || isAdminChat(chat));
    },
    onMessage: (m, stale) => (off ? Promise.resolve("pass" as const) : c.pipeline.onMessage(m, stale)),
    onEdited: (m) => (off ? Promise.resolve() : c.pipeline.onEdited(m)),
    onMember: (u) => (off ? Promise.resolve() : c.members.onMember(u)),
    onMyMember: (u) => (off ? noteAdded(u) : c.members.onMyMember(u)),
    onPress,
    askPrivate: (m, question) => (off ? no() : c.qa.askPrivate(m, question)),
    offerPrivate: (m, text) => (off ? no() : c.qa.offerPrivate(m, text)),
    reportPrivate: (m, text) => (off ? no() : c.reports.onPrivateReport(m, text)),
    async startPrivate(m, arg) {
      if (off || arg !== "appeal" || !c.appeals) return false;
      await c.appeals.onStart(m);
      return true;
    },
    // Hidden while switched off (an owner's /ai off, billing, a missing model, a refused key); offered while paused for the day, after errors or for a ramp limit, and asking says so.
    aiOn: () => input.privateAi && usable(),
    groupAi: () => c.chats.length > 0 && usable(),
    // The public /health shows only this; the rest is in /status in the admin chat.
    health: () => ({ enabled: !off }),
    save: () => input.store.save(),
    stop() {
      timers.stop();
      deleter?.stop();
      // Deletes still batched go into the records before the final save.
      out.stop();
      input.store.stop();
    },
    async disable(why) {
      if (off) return;
      off = true;
      log(`community off: ${why}`);
      timers.stop();
      out.stop();
      // The notices, routine alerts and removed messages it scheduled still go when due: nothing else runs.
      if (input.store.deletesLeft) deleter = startDeleter({ out, records: input.records, left: () => input.store.deletesLeft?.() ?? 0, now, log });
      await input.store.save();
      input.onChange?.();
    },
  };
}
