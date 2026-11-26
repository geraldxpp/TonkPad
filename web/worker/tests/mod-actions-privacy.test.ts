import { describe, expect, it } from "vitest";
import type { AdminAlert, Decision } from "../src/telegram/community/types";
import { applyDecision, type ModDeps, type ModTarget } from "../src/telegram/mod/actions";
import { GROUP_ID, MEMBER, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const alerts: AdminAlert[] = [];
  const deps: ModDeps = {
    out: recordOut(),
    records: memoryRecords({ strictness: "normal" }),
    words: () => testWords,
    alerts: { alert: (a) => void alerts.push(a) },
    recentIds: () => [],
    bot: () => "TonkfunBot",
    now: () => NOW,
    site: "https://www.tonkfun.fun",
  };
  return { alerts, deps };
}

const target = (over: Partial<ModTarget> = {}): ModTarget => ({
  chat: GROUP_ID, user: MEMBER.id, senderChat: null, messageIds: [42], name: "Sam", username: "sam", lang: "en",
  excerpt: "call me on +44 20 7946 0958 or sam@example.com", link: "https://t.me/c/1234567890/42", ageSeconds: 3, ...over,
});

const removal: Decision = { actions: [{ kind: "delete" }], category: "contact_info", source: "rule", offence: "none", notice: "contact", alert: "action", observeOnly: false };

describe("what an action's alert carries", () => {
  it("never repeats the phone number or e-mail address it removed for privacy", async () => {
    const { alerts, deps } = setup();
    await applyDecision(removal, target(), deps);
    await flush();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].excerpt).toBeNull();
  });

  it("carries when a newcomer joined, when the bot knows it, and nothing otherwise", async () => {
    const { alerts, deps } = setup();
    const joined = NOW - 3 * 3_600_000;
    await applyDecision({ ...removal, category: "newcomer_link", notice: "newcomer" }, target({ since: joined }), deps);
    await applyDecision({ ...removal, category: "newcomer_link", notice: "newcomer" }, target({ user: MEMBER.id + 1 }), deps);
    await flush();
    expect(alerts.map((a) => a.member?.since)).toEqual([joined, null]);
  });
});
