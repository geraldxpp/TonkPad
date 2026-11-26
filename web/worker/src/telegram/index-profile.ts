import type { BotApi } from "./api";
import { type ProfileOptions, syncProfile } from "./profile";
import { type InlineFeedback, setInlineFeedback } from "./profile-settings";
import type { Sender, Sleep } from "./sender";
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
  /** The Bot API for inline feedback (profile-settings.ts), and how its retries wait; without it, feedback stays as @BotFather has it. */
  api?: BotApi;
  sleep?: Sleep;
  /**
   * How often to look again without being told: whether AI can answer also changes with an owner's /ai, billing or a
   * refused key, which send no change event. A look with nothing changed makes no Telegram call. None when absent.
   */
  everyMs?: number;
}

/**
 * The bot's profile and menus, and its inline feedback, set at start and
 * again whenever what they offer changes (the community agent drops a
 * group, its admin chat passes its checks, or community mode turns off).
 * One sync at a time: a change during a sync runs one more after it, with
 * the options read then. Inline feedback goes first, since Ask TonkFun
 * needs it (profile-settings.ts): set at the first sync, then again when
 * whether Ask can be offered changed, or the last set failed, as a failed
 * profile is set again at the next sync. It never rejects.
 */
export function createProfileSync(deps: ProfileSyncDeps): { run(): void; idle(): Promise<void>; feedback(): InlineFeedback | null; stop(): void } {
  let running: Promise<void> | null = null;
  let again = false;
  /** Whether Ask could be offered when feedback was last set (null until a set succeeds), and what /health shows (null before the first). */
  let setFor: boolean | null = null;
  let feedback: InlineFeedback | null = null;

  async function loop(): Promise<void> {
    do {
      again = false;
      try {
        const options = deps.options();
        if (deps.api && setFor !== options.ai) {
          feedback = await setInlineFeedback(deps.api, options.ai, deps.log, deps.sleep);
          setFor = feedback === "failed" ? null : options.ai;
        }
        const next = await syncProfile(deps.sender, { hash: deps.state.profileHash, menus: deps.state.menus }, deps.log, deps.botId, options);
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

  function run(): void {
    if (running) {
      again = true;
      return;
    }
    running = loop().finally(() => {
      running = null;
    });
  }

  const timer = deps.everyMs && deps.everyMs > 0 ? setInterval(run, deps.everyMs) : null;
  timer?.unref?.();

  return {
    run,
    idle: () => running ?? Promise.resolve(),
    feedback: () => feedback,
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}
