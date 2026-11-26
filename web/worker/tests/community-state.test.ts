// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LANES } from "../src/telegram/claude/types";
import { createRecords } from "../src/telegram/community/records";
import { type CommunityStateFile, emptyCommunityState, loadCommunityState, saveCommunityState } from "../src/telegram/community/state";
import { AI_OFF_REASONS, COUNTER_KEYS, RULE_CATEGORIES, type RuleCategory, STRICTNESS_LEVELS, type Strictness } from "../src/telegram/community/types";
import { ADMIN_CHAT_ID, GROUP_ID, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";

const MINUTE = 60_000;
const SAM = MEMBER.id;
const KIM = 202;
const NAME = "0123456789abcdef";
const defaults = () => ({ paused: false, proactive: true, strictness: "observe" as const, raidUntil: 0 });
const recordsOver = (state: CommunityStateFile) => createRecords(state, { persist: () => undefined, defaults, now: () => NOW });

/** A state holding one of every record, written through the records. */
function fullState(): CommunityStateFile {
  const state = emptyCommunityState();
  const records = recordsOver(state);
  records.updateSettings(GROUP_ID, { strictness: "normal", raidUntil: NOW + 30 * MINUTE });
  records.count(GROUP_ID, "removed", NOW, 4);
  records.count(GROUP_ID, "answers", NOW);
  records.addOffence(GROUP_ID, SAM, NOW, "lookalike", true);
  records.addOffence(GROUP_ID, SAM, NOW, "model_spam", false);
  records.markNewcomer(GROUP_ID, KIM, NOW, NOW + 3 * 86_400_000);
  records.setPending({ chat: GROUP_ID, user: KIM, messageId: 500, joinMessageId: null, deadline: NOW + 3 * MINUTE, target: 7, tries: 1 });
  records.trust(GROUP_ID, SAM, NAME, NOW);
  records.markAppeal(GROUP_ID, SAM, NOW);
  records.scheduleDelete(ADMIN_CHAT_ID, 800, NOW + 47 * 3_600_000);
  records.setSpend({ day: "2026-11-06", lanes: { triage: 0.31, group: 0.2, proactive: 0.05, private: 0 } });
  records.setAiOff({ reason: "admin", since: NOW });
  return state;
}

const FIELDS = new Set<string>([
  "v", "spend", "off", "chats", "counters", "warnings", "newcomers", "pending", "trusted", "appeals", "deletes", "day", "lanes", ...LANES,
  "reason", "since", "paused", "proactive", "strictness", "raidUntil", ...COUNTER_KEYS, "n", "certain", "last", "category", "passedAt",
  "until", "chat", "user", "messageId", "joinMessageId", "deadline", "target", "tries", "name", "due", "added",
]);
const ENUMS = new Set<string>([...STRICTNESS_LEVELS, ...RULE_CATEGORIES, ...AI_OFF_REASONS]);
const ID_KEY = /^-?[1-9]\d*(:-?[1-9]\d*)?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FINGERPRINT = /^[0-9a-f]{16}$/;

/** Everything in a parsed file that isn't a field name, an ID or day key, a number, a boolean, a known enum, a day or a fingerprint. */
function strays(value: unknown, path = "$"): string[] {
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return [];
  if (typeof value === "string") return ENUMS.has(value) || DAY.test(value) || FINGERPRINT.test(value) ? [] : [`${path} = ${value}`];
  if (Array.isArray(value)) return value.flatMap((item, i) => strays(item, `${path}[${i}]`));
  if (typeof value !== "object") return [`${path}: ${typeof value}`];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(FIELDS.has(key) || ID_KEY.test(key) || DAY.test(key) ? [] : [`${path} key ${key}`]),
    ...strays(item, `${path}.${key}`),
  ]);
}

describe("the community state file", () => {
  let dir = "";
  let path = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tonk-community-"));
    path = join(dir, "data", "community.json");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("comes back as it was saved", async () => {
    const state = fullState();
    await saveCommunityState(path, state);
    const loaded = await loadCommunityState(path);
    expect(loaded).toEqual(state);
    const records = recordsOver(loaded);
    expect(records.settings(GROUP_ID).strictness).toBe("normal");
    expect(records.counts(GROUP_ID, NOW)).toMatchObject({ removed: 4, answers: 1, banned: 0 });
    expect(records.pendingOn(GROUP_ID, 500).map((p) => p.user)).toEqual([KIM]);
    expect(records.isNewcomer(GROUP_ID, KIM, NOW)).toBe(true);
    expect(records.appealAt(GROUP_ID, SAM)).toBe(NOW);
    expect(records.dueDeletes(NOW + 47 * 3_600_000)).toEqual([{ chat: ADMIN_CHAT_ID, messageId: 800 }]);
    expect(records.spend()?.lanes.triage).toBe(0.31);
  });

  it("keeps trust, the certain count and the AI-off switch over a restart", async () => {
    await saveCommunityState(path, fullState());
    const records = recordsOver(await loadCommunityState(path));
    expect(records.trustedName(GROUP_ID, SAM, NAME)).toBe(true);
    expect(records.trustedName(GROUP_ID, SAM, "fedcba9876543210")).toBe(false);
    expect(records.offences(GROUP_ID, SAM, NOW)).toEqual({ n: 2, certain: 1, last: NOW, category: "model_spam" });
    expect(records.aiOff()).toEqual({ reason: "admin", since: NOW });
    const state = await loadCommunityState(path);
    recordsOver(state).setAiOff(null);
    await saveCommunityState(path, state);
    expect(recordsOver(await loadCommunityState(path)).aiOff()).toBeNull();
  });

  it("starts empty from a missing, unreadable or foreign file", async () => {
    expect(await loadCommunityState(path)).toEqual(emptyCommunityState());
    await mkdir(join(dir, "data"), { recursive: true });
    for (const text of ["{not json", "null", "[]", "42", JSON.stringify({ ...fullState(), v: 2 })]) {
      await writeFile(path, text);
      expect(await loadCommunityState(path), text.slice(0, 12)).toEqual(emptyCommunityState());
    }
    expect(await loadCommunityState(dir)).toEqual(emptyCommunityState());
  });

  it("drops malformed entries and every key it doesn't know", async () => {
    const group = String(GROUP_ID);
    const file = {
      v: 1,
      notes: "a member said hello",
      spend: { day: "2026-11-06", lanes: { triage: 0.1, group: -1, chat: 5 }, by: "owner" },
      off: { reason: "tired", since: NOW },
      chats: { [group]: { paused: false, proactive: true, strictness: "relaxed", raidUntil: 0, title: "Tonk talk" }, "-1007": { paused: 1 } },
      counters: { [group]: { "2026-11-06": { removed: 2, words: 9, banned: -1 }, today: { removed: 1 } } },
      warnings: { [group]: { [String(SAM)]: { n: 2, certain: 3, last: NOW, category: null }, [String(KIM)]: { n: 1, certain: 1, last: NOW, category: "said hi", text: "spam" } } },
      newcomers: { [group]: { alice: { passedAt: NOW, until: NOW + 1 } }, ["__proto__"]: { [String(SAM)]: { passedAt: NOW, until: NOW + 1 } } },
      pending: { anything: { chat: GROUP_ID, user: SAM, messageId: 5, joinMessageId: null, deadline: NOW, target: null, tries: 0, name: "Sam" }, bad: { chat: GROUP_ID, user: 0 } },
      trusted: { [group]: { [String(SAM)]: { since: NOW, name: "Sam Smith" }, [String(KIM)]: { since: NOW, name: NAME, username: "kim" } } },
      appeals: { [group]: { [String(SAM)]: NOW, "1.5": NOW, [String(KIM)]: "yesterday" } },
      deletes: [{ chat: GROUP_ID, messageId: 9, due: NOW, added: NOW, text: "notice" }, { chat: GROUP_ID, messageId: -1, due: NOW, added: NOW }, "x"],
    };
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(path, JSON.stringify(file));
    const expected: CommunityStateFile = {
      v: 1,
      spend: { day: "2026-11-06", lanes: { triage: 0.1, group: 0, proactive: 0, private: 0 } },
      off: null,
      chats: { [group]: { paused: false, proactive: true, strictness: "relaxed", raidUntil: 0 } },
      counters: { [group]: { "2026-11-06": { removed: 2 } } },
      warnings: { [group]: { [String(KIM)]: { n: 1, certain: 1, last: NOW, category: null } } },
      newcomers: {},
      pending: { [`${GROUP_ID}:${SAM}`]: { chat: GROUP_ID, user: SAM, messageId: 5, joinMessageId: null, deadline: NOW, target: null, tries: 0 } },
      trusted: { [group]: { [String(KIM)]: { since: NOW, name: NAME } } },
      appeals: { [group]: { [String(SAM)]: NOW } },
      deletes: [{ chat: GROUP_ID, messageId: 9, due: NOW, added: NOW }],
    };
    expect(await loadCommunityState(path)).toEqual(expected);
  });

  it("saves only IDs, numbers, booleans, the known enums and fingerprints", async () => {
    const state = fullState();
    const records = recordsOver(state);
    records.trust(GROUP_ID, KIM, "Kim Jones", NOW);
    records.addOffence(GROUP_ID, KIM, NOW, "Kim posted a link" as RuleCategory, false);
    records.updateSettings(GROUP_ID, { strictness: "Tonk talk" as Strictness });
    Object.assign(state, { notes: "secret text" });
    state.chats["Tonk talk"] = defaults();
    Object.assign(state.warnings[String(GROUP_ID)], { alice: { n: 1, certain: 0, last: NOW, category: null } });
    Object.assign(state.pending[`${GROUP_ID}:${KIM}`], { text: "hello there" });
    Object.assign(state.deletes[0], { excerpt: "a notice" });
    await saveCommunityState(path, state);
    const text = await readFile(path, "utf8");
    expect(strays(JSON.parse(text))).toEqual([]);
    for (const words of ["Kim", "Tonk talk", "secret text", "alice", "hello there", "a notice"]) expect(text).not.toContain(words);
  });

  it("writes one whole file, readable by the worker only, in call order", async () => {
    const first = fullState();
    const second = emptyCommunityState();
    recordsOver(second).trust(GROUP_ID, KIM, NAME, NOW);
    const saves = [saveCommunityState(path, first), saveCommunityState(path, second)];
    recordsOver(second).forgetMember(GROUP_ID, KIM);
    await Promise.all(saves);
    expect((await loadCommunityState(path)).trusted).toEqual({ [String(GROUP_ID)]: { [String(KIM)]: { since: NOW, name: NAME } } });
    expect(await readdir(join(dir, "data"))).toEqual(["community.json"]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("rejects a failed save, and the next one still lands", async () => {
    await writeFile(join(dir, "data"), "a file where the folder should be");
    await expect(saveCommunityState(path, fullState())).rejects.toThrow();
    await rm(join(dir, "data"));
    await saveCommunityState(path, fullState());
    expect(await loadCommunityState(path)).toEqual(fullState());
  });
});
