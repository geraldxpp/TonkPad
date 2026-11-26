import { access, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { emptyCommunityState, loadCommunityState, saveCommunityState } from "./state";
import { utcDay } from "./state-check";

/** community.json, where config.ts finds it: TELEGRAM_COMMUNITY_STATE_PATH, else beside the snapshot. */
export function statePathOf(env: Readonly<Record<string, string | undefined>>, snapshotPath: string): string {
  const set = env.TELEGRAM_COMMUNITY_STATE_PATH?.trim();
  return set ? set : join(dirname(snapshotPath), "community.json");
}

/**
 * Community mode is off, so nothing runs to keep community.json within the
 * privacy page's limits: a start without it keeps only what holds no
 * member's records (each group's settings, the AI-off switch, today's
 * spending without IDs) and drops the rest: warnings, newcomers, checks,
 * trusted members, reviews, counters and message IDs to delete. With
 * nothing left the file is removed. Without a file nothing happens, and
 * nothing is logged. It never throws; it logs no ID.
 */
export async function retireState(path: string, now: number, log: (line: string) => void): Promise<void> {
  try {
    await access(path);
  } catch {
    return;
  }
  try {
    const state = await loadCommunityState(path);
    const kept = emptyCommunityState();
    kept.chats = state.chats;
    kept.off = state.off;
    kept.spend = state.spend && state.spend.day === utcDay(now) ? state.spend : null;
    if (kept.off === null && kept.spend === null && Object.keys(kept.chats).length === 0) {
      await unlink(path);
      log("community.json removed: community mode is off, so it keeps no records");
      return;
    }
    await saveCommunityState(path, kept);
    log("community.json pruned: community mode is off, so it keeps no member's records");
  } catch (error) {
    log(`community.json couldn't be pruned (${error instanceof Error ? error.name : "error"})`);
  }
}
