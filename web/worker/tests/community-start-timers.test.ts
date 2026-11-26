// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiLimits } from "../src/telegram/claude/limits";
import { type AiLimits, DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import type { CommunityConfig } from "../src/telegram/community/config";
import { createHolds, createOnce, HOLD_MS } from "../src/telegram/community/hold";
import { buildCommunity } from "../src/telegram/community/index-build";
import { startTimers } from "../src/telegram/community/index-hooks-tick";
import { fakeData, OFFICIAL, packSource } from "./agent-answer-fixtures";
import { ADMIN_CHAT_ID, adminInfo, fakeAdmins, GROUP_ID, memoryRecords, openBudget, OWNER_ID, recordOut, testWords } from "./community-fixtures";
import { answer, ME, scripted, SITE, verdict } from "./community-pipeline-fixtures";
import { MIN, NOW, SEC } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";

/**
 * The community's timers (privacy#5, robustness#3): every 5 seconds each
 * piece of work runs in a lane of its own, the in-memory prunes first, so a
 * lane Telegram holds up (a join raid's new-member checks) holds up only
 * itself; and the private texts waiting for Ask or Share go after 10
 * minutes on their own timers.
 */

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const CONFIG: CommunityConfig = {
  apiKey: "test-key-0123456789abcdef", chats: [GROUP_ID], adminChat: ADMIN_CHAT_ID, owners: [OWNER_ID], adminLang: "en", groupLang: "en", mode: "normal",
  budgetUsd: 3, answerModel: DEFAULT_ANSWER_MODEL, privateAi: true, userCodeKey: "a".repeat(64), allowedDomains: [], allowedBots: [], officialX: ["tonkfun"],
  helplineUrl: "https://findahelpline.com/", statePath: "/nowhere/community.json",
};

/** A community built from the shared fakes, its timers started on the fake clock, each lane's runs counted. */
function bench() {
  const now = () => Date.now();
  const counts: Record<string, number> = { memory: 0, out: 0, alerts: 0, raid: 0, pipeline: 0, newcomers: 0, watch: 0 };
  const base = createAiLimits();
  const limits: AiLimits = { ...base, prune: (at) => {
    counts.memory += 1;
    base.prune(at);
  } };
  const out = recordOut();
  const records = memoryRecords({ strictness: "normal" });
  const logs: string[] = [];
  const community = buildCommunity({
    config: CONFIG, chats: [GROUP_ID], out, records, client: scripted({ triage: verdict(), answer: answer() }), budget: openBudget(), limits,
    admins: fakeAdmins({ [GROUP_ID]: [adminInfo(7_002)] }, [OWNER_ID]), alerts: { alert: () => undefined, tick: async () => undefined }, pack: packSource(),
    data: fakeData(), official: OFFICIAL, allow: ALLOW, me: () => ME, teamChat: () => false, discussion: () => false, title: () => "tonkfun.fun community",
    rights: () => ({ delete: true, restrict: true }), prompt: async () => undefined, site: SITE, now, log: (line) => void logs.push(line), words: () => testWords,
  });
  // A join raid: the new-member checks wait on Telegram until `release` is called.
  let release = () => undefined as void;
  community.newcomers = { ...community.newcomers, tick: () => {
    counts.newcomers += 1;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  } };
  const raidTick = community.raid.tick;
  community.raid = { ...community.raid, tick: (at) => {
    counts.raid += 1;
    return raidTick(at);
  } };
  const pipelineTick = community.pipeline.tick;
  community.pipeline = { ...community.pipeline, tick: (at) => {
    counts.pipeline += 1;
    return pipelineTick(at);
  } };
  const timers = startTimers({
    community, records, admins: fakeAdmins(), limits, pack: packSource(), readRights: async () => undefined, now, log: (line) => void logs.push(line),
    out: { ...out, tick: async () => void (counts.out += 1) },
    alerts: { tick: async () => void (counts.alerts += 1) },
    watch: { tick: async () => void (counts.watch += 1) },
    setup: null,
  });
  return { counts, timers, logs, release: () => release(), community };
}

describe("the community's timers", () => {
  it("keeps pruning, deleting, alerting and ending raids while the new-member checks wait on Telegram", async () => {
    const { counts, timers, release } = bench();
    try {
      await vi.advanceTimersByTimeAsync(10 * MIN);
      // 120 ticks: the stuck lane started once and was skipped since; every other lane ran each time.
      expect(counts.newcomers).toBe(1);
      for (const lane of ["memory", "out", "alerts", "raid", "pipeline", "watch"]) expect(counts[lane], lane).toBe(120);
      release();
      await vi.advanceTimersByTimeAsync(5 * SEC);
      expect(counts.newcomers).toBe(2);
    } finally {
      timers.stop();
    }
  });

  it("logs a lane that fails by its name, and runs it again at the next tick", async () => {
    const { community, timers, logs } = bench();
    try {
      let fails = 0;
      community.pipeline = { ...community.pipeline, tick: async () => {
        fails += 1;
        throw new Error("boom");
      } };
      await vi.advanceTimersByTimeAsync(10 * SEC);
      expect(fails).toBe(2);
      expect(logs.filter((line) => line === "community pipeline failed")).toHaveLength(2);
    } finally {
      timers.stop();
    }
  });
});

describe("the private texts held for Ask and Share", () => {
  it("go 10 minutes after they were held whatever the ticks do, and each is taken once", async () => {
    const holds = createHolds();
    holds.put(1, 10, { text: "how do locks work?", lang: "en", escalate: "none", at: NOW });
    holds.put(1, 11, { text: "my funds are stuck", lang: "en", escalate: "lost_funds", at: NOW });
    expect(holds.take(1, 11, NOW)?.text).toBe("my funds are stuck");
    expect(holds.take(1, 11, NOW)).toBeNull();
    await vi.advanceTimersByTimeAsync(HOLD_MS - SEC);
    // Asked with the time it was held, so only its own timer can have removed it.
    expect(holds.take(1, 10, NOW)?.text).toBe("how do locks work?");
    holds.put(1, 12, { text: "what is the Shield?", lang: "en", escalate: "none", at: Date.now() });
    await vi.advanceTimersByTimeAsync(HOLD_MS);
    expect(holds.take(1, 12, NOW)).toBeNull();
  });

  it("keep at most 1,000, the oldest going first", () => {
    const holds = createHolds();
    for (let id = 1; id <= 1_001; id += 1) holds.put(1, id, { text: `q${id}`, lang: "en", escalate: "none", at: NOW });
    expect(holds.take(1, 1, NOW)).toBeNull();
    expect(holds.take(1, 1_001, NOW)?.text).toBe("q1001");
  });

  it("let a dedupe forget its keys once their window has passed", () => {
    const once = createOnce(30 * MIN);
    expect(once.first("chat", NOW)).toBe(true);
    expect(once.first("chat", NOW + MIN)).toBe(false);
    once.prune(NOW + 30 * MIN);
    expect(once.first("chat", NOW + 30 * MIN)).toBe(true);
  });
});
