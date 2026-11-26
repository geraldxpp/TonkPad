import type { PackSource } from "../agent/types";
import type { AiLimits } from "../claude/types";
import type { Community } from "./index-build";
import { inChat } from "./members-joins";
import type { CommunityOut } from "./out";
import type { Admins, ChatId, Records } from "./types";

export interface TimerInput {
  community: Community;
  out: CommunityOut & { tick(now: number): Promise<void> };
  records: Records;
  /** With known (admins.ts), a group whose list Telegram never confirmed is read again every 30 seconds. */
  admins: Admins & { known?(chat: ChatId): boolean };
  limits: AiLimits;
  pack: PackSource;
  alerts: { tick(now: number): Promise<void>; prune?(now: number): void } | null;
  watch: { tick(now: number): Promise<void> } | null;
  /** The setup checks Telegram couldn't answer at start, asked again (setup-retry.ts), or null. */
  setup: { tick(now: number): Promise<void> } | null;
  /** Reads the bot's own rights in each group again, for /status. */
  readRights: () => Promise<void>;
  now: () => number;
  log: (line: string) => void;
}

const MINUTE = 60_000;
const TICK_MS = 5_000;
const ADMINS_MS = 10 * MINUTE;
const SWEEP_FIRST_MS = 60 * MINUTE;
const SWEEP_MS = 7 * 24 * 60 * MINUTE;

/**
 * The community agent's timers. Every 5 seconds, first the in-memory
 * prunes, which keep IDs and text no longer than the privacy page says,
 * then each piece of work that falls due in a lane of its own: deletes and
 * caches, new-member checks, raid mode, alerts, the admin chat's watch,
 * unprompted answers, setup checks still unanswered, admin lists Telegram
 * never confirmed (every 30 seconds, admins.ts), the knowledge pack's read.
 * The tick awaits none of them, so a lane Telegram slows down (a join
 * raid's checks) holds up only itself, and is skipped while still running.
 * Every minute the records' retention; every 10 minutes the admin lists;
 * the trusted members' sweep an hour after start and then weekly. A lane
 * that fails is logged by name and the rest go on.
 */
export function startTimers(input: TimerInput): { stop(): void } {
  const { community: c, records, now, log } = input;
  const running = new Set<string>();
  let sweepAt = now() + SWEEP_FIRST_MS;

  /** Runs one lane unless it is still running; its sync part runs at once. */
  function lane(name: string, run: () => Promise<void> | void): void {
    if (running.has(name)) return;
    running.add(name);
    void (async () => {
      try {
        await run();
      } catch {
        log(`community ${name} failed`);
      } finally {
        running.delete(name);
      }
    })();
  }

  function memory(at: number): void {
    // The windows hold user IDs and text for up to 10 minutes: pruned here, not only past their size limits.
    input.limits.prune(at);
    c.flood.prune(at);
    c.proactive.prune(at);
    c.edits.prune(at);
    c.asks.prune(at);
    c.shares.prune(at);
    c.dm.prune(at);
    c.qa.prune(at);
    c.answers.prune();
    c.checks.prune();
    input.alerts?.prune?.(at);
  }

  /** Groups whose admin list Telegram never confirmed, read again (admins.ts lets one through every 30 seconds): until then only protective deletes act there. */
  async function unconfirmed(at: number): Promise<void> {
    const { admins } = input;
    for (const chat of [...c.chats]) {
      if (admins.known?.(chat) !== false) continue;
      await admins.refresh(chat, at).catch(() => undefined);
      if (admins.known?.(chat) === true) log(`community group ${chat}: its admin list was read, so moderation runs as set`);
    }
  }

  function tick(): void {
    const at = now();
    lane("memory", () => memory(at));
    lane("deletes", () => input.out.tick(at));
    lane("new-member checks", () => c.newcomers.tick(at));
    lane("raid mode", () => c.raid.tick(at));
    lane("alerts", () => input.alerts?.tick(at));
    lane("admin chat watch", () => input.watch?.tick(at));
    lane("pipeline", () => c.pipeline.tick(at));
    lane("setup checks", () => input.setup?.tick(at));
    lane("unconfirmed admin lists", () => unconfirmed(at));
    // Reads the site only when a read is due (every 30 minutes); it never rejects.
    void input.pack.refresh(at);
  }

  /** Trusted members no longer in the group (they left, or were removed) lose their records, as anyone leaving does; an unknown answer changes nothing. */
  async function sweep(): Promise<void> {
    for (const chat of [...c.chats]) {
      for (const user of records.trusted(chat)) {
        const member = await input.out.member(chat, user).catch(() => null);
        if (member && !inChat(member)) records.forgetMember(chat, user);
      }
    }
  }

  function prune(): void {
    const at = now();
    lane("records", () => {
      records.prune(at);
      c.answered.prune(at);
    });
    if (at < sweepAt) return;
    sweepAt = at + SWEEP_MS;
    lane("trusted sweep", sweep);
  }

  function refreshAdmins(): void {
    lane("admin lists", async () => {
      for (const chat of [...c.chats]) await input.admins.refresh(chat, now()).catch(() => log("community admin list failed"));
      await input.readRights();
    });
  }

  const timers = [setInterval(tick, TICK_MS), setInterval(prune, MINUTE), setInterval(refreshAdmins, ADMINS_MS)];
  for (const timer of timers) timer.unref?.();
  return {
    stop() {
      for (const timer of timers) clearInterval(timer);
    },
  };
}
