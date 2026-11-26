import { type AutoDelete, checkAdminChat, checkGroup, droppedAlerts, retryingReader, type SetupDeps } from "./setup";
import type { ChatId } from "./types";

/** The first re-check comes 30 seconds after start, then twice as long each time, at most every 10 minutes. */
const FIRST_MS = 30_000;
const MAX_MS = 10 * 60_000;
/** An admin chat Telegram still hasn't answered for this long after start turns community mode off: its alerts would never reach anyone. */
const GIVE_UP_MS = 60 * 60_000;

export interface SetupRetryDeps {
  /** As at start; `chats` is unused here. */
  setup: SetupDeps;
  /** Whether the admin chat's checks are still unanswered. */
  adminChat: boolean;
  /** The groups whose checks are still unanswered. */
  chats: readonly ChatId[];
  /** Running groups whose getChat failed at start (their title, public username and linked channel), read again until it answers. */
  unread?: readonly ChatId[];
  /** Reads one group's getChat again and applies it; true once it answered. */
  readInfo?: (chat: ChatId) => Promise<boolean>;
  /** The admin chat passed: its alerts may go out, and the auto-delete timer is as read. */
  passed(autoDelete: Exclude<AutoDelete, null>): void;
  /** The admin chat failed for certain, or went unanswered for an hour: community mode turns off. */
  failed(): void;
  /** A group failed for certain: it is dropped (its alerts are already sent); `gone` when the bot isn't in it any more, so its records go too. */
  drop(chat: ChatId, gone: boolean): void;
  log: (line: string) => void;
  now: number;
}

/**
 * The setup checks Telegram couldn't answer at start, asked again from the
 * tick (prompts/15-community-agent.md, Setup checks): one try per read, 30
 * seconds after start, then backing off to every 10 minutes, until every
 * one has a definite answer. A pass changes nothing for a group, and opens
 * the admin chat; a definite failure drops the group, or turns community
 * mode off for the admin chat, as does an admin chat still unanswered an
 * hour after start. A group's getChat that failed at start is read again
 * the same way. tick() never rejects.
 */
export function createSetupRetry(deps: SetupRetryDeps): { tick(now: number): Promise<void>; waiting(): boolean } {
  let adminChat = deps.adminChat;
  let chats = [...deps.chats];
  let unread = [...(deps.unread ?? [])];
  let wait = FIRST_MS;
  let dueAt = deps.now + wait;
  const done = () => !adminChat && chats.length === 0 && unread.length === 0;
  let over = done();

  function giveUp(): void {
    deps.log("community off: the admin chat still can't be read an hour after start (is the bot in it? is TELEGRAM_ADMIN_CHAT_ID right?)");
    over = true;
    deps.failed();
  }

  async function round(): Promise<void> {
    const notes: string[] = [];
    const read = retryingReader([]);
    if (adminChat) {
      const admin = await checkAdminChat(deps.setup, notes, read);
      if (admin.verdict === "off") {
        for (const line of notes) deps.log(line);
        over = true;
        deps.failed();
        return;
      }
      if (admin.verdict === "ok") {
        adminChat = false;
        deps.log("the admin chat passed its checks: its alerts go out now");
        deps.passed(admin.autoDelete ?? "long");
      }
    }
    const left: ChatId[] = [];
    for (const chat of chats) {
      const group = await checkGroup(deps.setup, chat, notes, read);
      if (group.problems.length > 0) {
        for (const a of await droppedAlerts(deps.setup, chat, group.problems)) deps.setup.alerts.alert(a);
        deps.drop(chat, group.problems.includes("gone"));
        unread = unread.filter((c) => c !== chat);
      } else if (group.unsure) left.push(chat);
      else deps.log(`community group ${chat} passed its checks`);
    }
    chats = left;
    const still: ChatId[] = [];
    for (const chat of unread) if (!(await (deps.readInfo?.(chat) ?? Promise.resolve(true)).catch(() => false))) still.push(chat);
    unread = still;
    // The "can't be read yet" notes are logged at start, not every round; only what changed is logged here.
    for (const line of notes) if (line.includes("dropped")) deps.log(line);
    over = done();
  }

  return {
    async tick(now) {
      if (over) return;
      if (adminChat && now - deps.now >= GIVE_UP_MS) return giveUp();
      if (now < dueAt) return;
      wait = Math.min(MAX_MS, wait * 2);
      dueAt = now + wait;
      try {
        await round();
      } catch {
        deps.log("community setup checks failed; tried again later");
      }
    },
    waiting: () => !over,
  };
}
