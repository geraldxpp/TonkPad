// @vitest-environment node
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_CHAT_ID, GROUP_ID, groupMessage } from "./community-fixtures";
import { SEED } from "./community-pipeline-fixtures";
import { startBench } from "./community-start-fixtures";
import { NOW } from "./fixtures";

/**
 * community.json keeps member records only as long as the privacy page
 * says, whatever happens at start (privacy#3): pruned and written back
 * before any check can turn community mode off, emptied of member records
 * when community mode is off, and without the records of a group no longer
 * in TELEGRAM_COMMUNITY_CHATS, trusted members included.
 */

const DAY = 86_400_000;
const OLD_GROUP = -1_002_222_222_222;
const MEMBER = 101;
const OTHER = 102;
const FINGERPRINT = "0123456789abcdef";

let dir = "";
const benches: Array<ReturnType<typeof startBench>> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "community-records-"));
});
afterEach(async () => {
  for (const b of benches.splice(0)) b.stop();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});
const setup = (options: Parameters<typeof startBench>[1] = {}) => {
  const b = startBench(dir, options);
  benches.push(b);
  return b;
};

const path = () => join(dir, "community.json");
const offence = (last: number) => ({ n: 1, certain: 1, last, category: "phishing" });
const today = new Date(NOW).toISOString().slice(0, 10);

/** A community.json with a fresh and an expired warning, trusted members in two groups, a newcomer, settings, spend and the AI-off switch. */
async function writeState(): Promise<void> {
  await writeFile(path(), JSON.stringify({
    v: 1,
    spend: { day: today, lanes: { group: 0.1, private: 0, proactive: 0, triage: 0.05 } },
    off: { reason: "admin", since: NOW - DAY },
    chats: { [GROUP_ID]: { paused: true, proactive: false, strictness: "strict", raidUntil: 0 } },
    counters: {},
    warnings: { [GROUP_ID]: { [MEMBER]: offence(NOW - DAY), [OTHER]: offence(NOW - 8 * DAY) }, [OLD_GROUP]: { [MEMBER]: offence(NOW - DAY) } },
    newcomers: { [OLD_GROUP]: { [OTHER]: { passedAt: NOW - DAY, until: NOW + 2 * DAY } } },
    pending: {},
    trusted: { [GROUP_ID]: { [MEMBER]: { since: NOW - 30 * DAY, name: FINGERPRINT } }, [OLD_GROUP]: { [OTHER]: { since: NOW - 30 * DAY, name: FINGERPRINT } } },
    appeals: {},
    deletes: [],
  }));
}

interface Saved {
  deletes: Array<{ chat: number; messageId: number; due: number }>;
  warnings: Record<string, Record<string, unknown>>;
  trusted: Record<string, Record<string, unknown>>;
  newcomers: Record<string, Record<string, unknown>>;
  chats: Record<string, unknown>;
  off: unknown;
  spend: unknown;
}
const saved = async () => JSON.parse(await readFile(path(), "utf8")) as Saved;

describe("community.json at start", () => {
  it("drops every member record of a group no longer allowed, trusted members included, and prunes the rest at once", async () => {
    await writeState();
    const s = setup();
    expect(await s.start()).not.toBeNull();
    const state = await saved();
    expect(Object.keys(state.warnings)).toEqual([String(GROUP_ID)]);
    // The expired warning is gone too, written back before anything else ran.
    expect(Object.keys(state.warnings[String(GROUP_ID)])).toEqual([String(MEMBER)]);
    expect(Object.keys(state.trusted)).toEqual([String(GROUP_ID)]);
    expect(state.newcomers).toEqual({});
  });

  it("is pruned and written back when a check turns community mode off", async () => {
    await writeState();
    const s = setup({ telegram: { getChat: (p) => ({ id: p.chat_id, type: "supergroup", title: "Team", username: p.chat_id === ADMIN_CHAT_ID ? "team_public" : "tonkfun_chat" }) } });
    expect(await s.start()).toBeNull();
    const state = await saved();
    expect(Object.keys(state.warnings[String(GROUP_ID)] ?? {})).toEqual([String(MEMBER)]);
    expect(state.trusted[String(OLD_GROUP)]).toBeUndefined();
  });

  it("keeps no member's records while community mode is off: only the groups' settings, today's spend and the AI-off switch", async () => {
    await writeState();
    const s = setup();
    s.deps.env = {};
    expect(await s.start()).toBeNull();
    const state = await saved();
    expect(state).toMatchObject({ warnings: {}, trusted: {}, newcomers: {}, off: { reason: "admin" }, spend: { day: today } });
    expect(Object.keys(state.chats)).toEqual([String(GROUP_ID)]);
    expect(s.logs).toContain("community.json pruned: community mode is off, so it keeps no member's records");
    expect(s.api.calls).toEqual([]);
  });

  it("removes community.json when community mode is off and nothing else is left in it", async () => {
    await writeFile(path(), JSON.stringify({ v: 1, warnings: { [GROUP_ID]: { [MEMBER]: offence(NOW - DAY) } }, trusted: { [GROUP_ID]: { [MEMBER]: { since: NOW, name: FINGERPRINT } } } }));
    const s = setup();
    s.deps.env = {};
    expect(await s.start()).toBeNull();
    await expect(access(path())).rejects.toThrow();
    expect(s.logs).toContain("community.json removed: community mode is off, so it keeps no records");
  });

  it("does nothing, and logs nothing more, without a community.json", async () => {
    const s = setup();
    s.deps.env = {};
    expect(await s.start()).toBeNull();
    expect(s.logs).toEqual(["community off: neither TELEGRAM_COMMUNITY_CHATS nor ANTHROPIC_API_KEY is set"]);
  });

  it("writes a delete still waiting in its 300 ms batch at a stop, so the next start makes it (telegram#7)", async () => {
    const s = setup();
    const hooks = await s.start();
    const scam = groupMessage(SEED);
    await hooks?.onMessage(scam, false);
    for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // The worker stops (a redeploy) before the batch goes: stop, then the save main.ts makes before it exits.
    hooks?.stop();
    await hooks?.save();
    const state = await saved();
    expect(state.deletes).toContainEqual(expect.objectContaining({ chat: GROUP_ID, messageId: scam.message_id }));
    expect(state.deletes.find((d) => d.messageId === scam.message_id)?.due).toBeLessThanOrEqual(NOW);
  });
});
