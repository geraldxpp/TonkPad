import { type ProfileOptions, syncProfile } from "./profile";
import type { Sender } from "./sender";
import type { BotState } from "./state";

export interface ProfileSyncDeps {
  sender: Sender;
  /** telegram.json's state: the profile's hash and the chat-scoped menus set, updated after each sync. */
  state: BotState;
  /** Saves the state soon (debounced by the caller). */
  persist: () => void;
  log: (line: string) => void;
  botId: number;
  /** What the menus offer now (wire.ts's profileOptions), read at the start of each sync. */
  options: () => ProfileOptions;
}

/**
 * The bot's profile and menus, set at start and again whenever what they
 * offer changes (the community agent drops a group, its admin chat passes
 * its checks, or community mode turns off). One sync at a time: a change
 * during a sync runs one more after it, with the options read then. It
 * never rejects.
 */
export function createProfileSync(deps: ProfileSyncDeps): { run(): void; idle(): Promise<void> } {
  let running: Promise<void> | null = null;
  let again = false;

  async function loop(): Promise<void> {
    do {
      again = false;
      try {
        const next = await syncProfile(deps.sender, { hash: deps.state.profileHash, menus: deps.state.menus }, deps.log, deps.botId, deps.options());
        if (next) {
          deps.state.profileHash = next.hash;
          deps.state.menus = [...next.menus];
          deps.persist();
        }
      } catch (error) {
        deps.log(`profile not set: ${error instanceof Error ? error.name : "error"}`);
      }
    } while (again);
  }

  return {
    run() {
      if (running) {
        again = true;
        return;
      }
      running = loop().finally(() => {
        running = null;
      });
    },
    idle: () => running ?? Promise.resolve(),
  };
}
