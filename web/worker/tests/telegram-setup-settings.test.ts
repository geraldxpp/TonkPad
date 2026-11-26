// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALES } from "@/shared/i18n/config";
import { type BotApi, TelegramError } from "../src/telegram/api";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import { createProfileSync } from "../src/telegram/index-profile";
import type { ProfileOptions } from "../src/telegram/profile";
import { inlineSettings, setInlineFeedback } from "../src/telegram/profile-settings";
import { Sender } from "../src/telegram/sender";
import { emptyState } from "../src/telegram/state";

/**
 * Inline feedback (profile-settings.ts): setMySettings asks Telegram for
 * every chosen inline result, with Ask's placeholder, while Ask can be
 * offered, and for none otherwise; inline mode itself is never touched. It
 * is set with the profile (index-profile.ts): at the first sync, again when
 * whether Ask can be offered changes or the last set failed.
 */

const ON = { inline_feedback_share_denominator: 1, inline_query_placeholder: "Token address or a question" };
const OFF = { inline_feedback_share_denominator: 0 };
const NONE: ProfileOptions = { privateAi: false, reports: false, communityChats: [], adminChat: null, ai: false };
const AI: ProfileOptions = { ...NONE, privateAi: true, ai: true };

/** A fake Bot API recording every call: setMySettings answers from `answers` in turn (an Error is thrown) and true once they run out; every other call true. */
function fakeApi(answers: Array<true | Error> = []) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api: BotApi = {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      calls.push({ method, params });
      const next = method === "setMySettings" ? answers.shift() : undefined;
      if (next instanceof Error) throw next;
      return true as T;
    },
  };
  const settings = () => calls.filter((c) => c.method === "setMySettings").map((c) => c.params);
  return { api, calls, settings };
}

/** The profile's sync over `api`, its Sender on a clock that moves only when it waits; `options` read at each sync. */
function syncing(t: ReturnType<typeof fakeApi>, options: () => ProfileOptions) {
  let clock = 0;
  const lines: string[] = [];
  const sender = new Sender(t.api, () => undefined, () => clock, async (ms) => void (clock += ms));
  const sync = createProfileSync({ sender, api: t.api, sleep: async () => undefined, state: emptyState(), persist: () => undefined, log: (l) => void lines.push(l), botId: 1, options });
  const once = async () => {
    sync.run();
    await sync.idle();
  };
  return { sync, lines, once };
}

describe("inline feedback's settings (profile-settings.ts)", () => {
  it("are every chosen result and the placeholder while Ask can be offered, none and the placeholder unchanged otherwise, never inline mode itself", () => {
    expect(inlineSettings(true)).toStrictEqual(ON);
    expect(inlineSettings(false)).toStrictEqual(OFF);
    expect(BOT_DICTIONARIES.en.inline.placeholder).toBe(ON.inline_query_placeholder);
    for (const { code } of LOCALES) expect(BOT_DICTIONARIES[code].inline.placeholder.trim(), code).not.toBe("");
  });

  it("are set with setMySettings, on or off, with nothing logged", async () => {
    const t = fakeApi();
    const lines: string[] = [];
    expect(await setInlineFeedback(t.api, true, (l) => void lines.push(l))).toBe("on");
    expect(await setInlineFeedback(t.api, false, (l) => void lines.push(l))).toBe("off");
    expect(t.calls).toEqual([{ method: "setMySettings", params: ON }, { method: "setMySettings", params: OFF }]);
    expect(lines).toEqual([]);
  });

  it("log one line naming the error alone when they aren't taken, and never throw", async () => {
    const lines: string[] = [];
    const refused = fakeApi([new TelegramError(400, "Bad Request: unknown parameter", null)]);
    expect(await setInlineFeedback(refused.api, true, (l) => void lines.push(l))).toBe("failed");
    const broken = fakeApi([new TypeError("unexpected")]);
    expect(await setInlineFeedback(broken.api, false, (l) => void lines.push(l))).toBe("failed");
    expect(lines).toEqual([
      "inline feedback: setMySettings failed (TelegramError); turn it on with /setinlinefeedback in @BotFather",
      "inline feedback: setMySettings failed (TypeError); turn it off with /setinlinefeedback in @BotFather",
    ]);
  });

  it("wait out a 429's retry_after, 3 times at most, and try a dropped connection once more, as the Sender does", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const tooMany = (after: number | null) => new TelegramError(429, "Too Many Requests", after);
    const dropped = () => new TelegramError(0, "", null);
    const log = () => undefined;
    expect(await setInlineFeedback(fakeApi([tooMany(7), tooMany(null), true]).api, true, log, sleep)).toBe("on");
    expect(await setInlineFeedback(fakeApi([dropped(), true]).api, true, log, sleep)).toBe("on");
    expect(waits).toEqual([7_000, 1_000, 1_000]);
    waits.length = 0;
    const busy = fakeApi([tooMany(1), tooMany(1), tooMany(1), tooMany(1), true]);
    expect(await setInlineFeedback(busy.api, true, log, sleep)).toBe("failed");
    expect([busy.settings(), waits]).toEqual([[ON, ON, ON, ON], [1_000, 1_000, 1_000]]);
    expect(await setInlineFeedback(fakeApi([dropped(), dropped()]).api, true, log, sleep)).toBe("failed");
  });
});

describe("inline feedback at each profile sync (index-profile.ts)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is set at the first sync, before the profile, and again only when whether Ask can be offered changes", async () => {
    const t = fakeApi();
    let options = AI;
    const { sync, once } = syncing(t, () => options);
    expect(sync.feedback()).toBeNull();
    await once();
    expect(sync.feedback()).toBe("on");
    expect(t.calls[0]).toEqual({ method: "setMySettings", params: ON });
    expect(t.calls.some((c) => c.method === "setMyDescription")).toBe(true);
    await once();
    expect(t.settings()).toEqual([ON]);
    options = NONE;
    await once();
    expect([t.settings(), sync.feedback()]).toEqual([[ON, OFF], "off"]);
  });

  it("is tried again at the next sync after a failure, which it reports meanwhile, while the profile is set as ever", async () => {
    const t = fakeApi([new TelegramError(404, "Not Found: method not found", null)]);
    const { sync, lines, once } = syncing(t, () => AI);
    await once();
    expect(sync.feedback()).toBe("failed");
    expect(lines.filter((l) => l.startsWith("inline feedback"))).toHaveLength(1);
    expect(t.calls.filter((c) => c.method === "setMyDescription")).toHaveLength(LOCALES.length);
    await once();
    expect([t.settings(), sync.feedback()]).toEqual([[ON, ON], "on"]);
  });

  it("looks again on its own every everyMs, so AI switched back on (an owner's /ai, billing, a key) turns feedback on without a restart", async () => {
    vi.useFakeTimers();
    const t = fakeApi();
    let options = NONE;
    let clock = 0;
    const sender = new Sender(t.api, () => undefined, () => clock, async (ms) => void (clock += ms));
    const sync = createProfileSync({ sender, api: t.api, sleep: async () => undefined, state: emptyState(), persist: () => undefined, log: () => undefined, botId: 1, options: () => options, everyMs: 300_000 });
    sync.run();
    await sync.idle();
    expect([t.settings(), sync.feedback()]).toEqual([[OFF], "off"]);
    options = AI;
    await vi.advanceTimersByTimeAsync(300_000);
    await sync.idle();
    expect([t.settings(), sync.feedback()]).toEqual([[OFF, ON], "on"]);
    // Nothing changed: a look sends nothing at all.
    const sent = t.calls.length;
    await vi.advanceTimersByTimeAsync(300_000);
    await sync.idle();
    expect(t.calls).toHaveLength(sent);
    sync.stop();
    options = NONE;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(t.settings()).toEqual([OFF, ON]);
  });

  it("is left as @BotFather has it without the Bot API", async () => {
    const t = fakeApi();
    let clock = 0;
    const sender = new Sender(t.api, () => undefined, () => clock, async (ms) => void (clock += ms));
    const sync = createProfileSync({ sender, state: emptyState(), persist: () => undefined, log: () => undefined, botId: 1, options: () => AI });
    sync.run();
    await sync.idle();
    expect([t.settings(), sync.feedback()]).toEqual([[], null]);
  });
});
