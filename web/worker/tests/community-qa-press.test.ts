// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AnsweredMap } from "../src/telegram/agent/answered";
import { JobQueue } from "../src/telegram/agent/jobs";
import { createProactive } from "../src/telegram/agent/proactive";
import { createAiLimits } from "../src/telegram/claude/limits";
import { DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import { createHolds } from "../src/telegram/community/hold";
import { createQa } from "../src/telegram/community/qa";
import type { AdminAlert } from "../src/telegram/community/types";
import type { TgCallbackQuery } from "../src/telegram/types";
import { fakeData, OFFICIAL, packSource } from "./agent-answer-fixtures";
import { callsOf, GROUP, GROUP_ID, memoryRecords, openBudget, recordOut } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, harness, person, scripted, settle, SITE, testWords } from "./community-pipeline-fixtures";
import { ASKER, dm, press } from "./community-qa-fixtures";

/**
 * The private chat's presses (K4): every press the Q&A flow takes is
 * answered, silently when it says nothing, so no spinner is left turning:
 * outside the presser's own private chat, without a message, and past the
 * press limit.
 */
const answered = (h: ReturnType<typeof harness>) => callsOf(h.out.log, "answerPress");

describe("the Q&A flow's presses", () => {
  it("answer silently a press outside the presser's own private chat, and do nothing else", async () => {
    const h = harness();
    const presses: TgCallbackQuery[] = [
      { ...press("askp"), from: person(999) },
      { ...press("a:12"), from: person(998) },
      { ...press("s:12"), message: { ...press("s:12").message!, chat: GROUP } },
      { ...press("a:12"), message: undefined },
    ];
    for (const q of presses) expect(await h.community.qa.onPress(q)).toBe(true);
    expect(answered(h)).toEqual(presses.map((q) => [q.id, undefined]));
    expect(h.prompts).toEqual([]);
    expect(h.alerts).toEqual([]);
  });

  it("answer silently past the press limit, without reading what is held", async () => {
    const h = harness();
    const presses = Array.from({ length: 9 }, (_, i) => press(`a:${500 + i}`, ASKER));
    for (const q of presses) await h.community.qa.onPress(q);
    const calls = answered(h);
    expect(calls).toHaveLength(9);
    expect(calls.slice(0, 8).map((c) => c[1])).toEqual(Array.from({ length: 8 }, () => testWords.answer.askExpired));
    expect(calls[8]).toEqual([presses[8].id, undefined]);
  });

  it("leave other presses to the router", async () => {
    const h = harness();
    expect(await h.community.qa.onPress(press("r:0xabc"))).toBe(false);
    expect(answered(h)).toEqual([]);
  });
});

/**
 * A Q&A flow built on its own, as index-build.ts builds it, with the admin
 * chat's setup gate (`ready`) and the team's alerts in reach; its answers
 * escalate a lost-funds case, so a private answer offers Share.
 */
function sharing(ready: { now: boolean }) {
  const out = recordOut();
  const records = memoryRecords();
  const alerts: AdminAlert[] = [];
  const reply = "On failed buys: a buy can fail for several reasons, and the Docs explain the launch-block tax.";
  const qa = createQa({
    out, records, client: scripted({ answer: answer({ escalate: "lost_funds", reply, admin_note: "Lost funds" }) }), budget: openBudget(), limits: createAiLimits(),
    pack: packSource(), data: fakeData(), official: OFFICIAL, answered: new AnsweredMap(), answers: new JobQueue({ concurrency: 4, maxPending: 50, now: () => NOW }),
    proactive: createProactive(), asks: createHolds(), shares: createHolds(), alerts: { alert: (a) => void alerts.push(a) }, adminReady: () => ready.now,
    words: () => testWords, groupLang: "en", site: SITE, bot: () => "TonkfunBot", helplineUrl: "https://findahelpline.com/", userCodeKey: null, privateAi: true, answerModel: DEFAULT_ANSWER_MODEL,
    home: GROUP_ID, dmWarning: () => true, prompt: async () => undefined, now: () => NOW, log: () => undefined,
  });
  return { qa, out, records, alerts };
}

/** wiring#2: while the admin chat's checks wait, a member is never told the team saw what they shared. */
describe("Share while the admin chat's checks wait", () => {
  it("says reports aren't set up yet, alerts and counts nothing, and shares the question on a press once the checks pass", async () => {
    const ready = { now: false };
    const s = sharing(ready);
    const m = dm("/ask my buy failed and my ETH is gone");
    await s.qa.askPrivate(m, "my buy failed and my ETH is gone");
    await settle();
    const offered = callsOf(s.out.log, "send")[0][2] as { keyboard?: { inline_keyboard: Array<Array<{ callback_data?: string }>> } };
    expect(offered.keyboard?.inline_keyboard.flat().pop()?.callback_data).toBe(`s:${m.message_id}`);

    const early = press(`s:${m.message_id}`);
    expect(await s.qa.onPress(early)).toBe(true);
    expect(callsOf(s.out.log, "answerPress")).toEqual([[early.id, testWords.report.noAdminChat]]);
    expect(s.alerts).toEqual([]);
    expect(s.records.counts(GROUP_ID, NOW).escalated).toBe(0);

    // The question waited for its 10 minutes: once the checks pass, Share sends it.
    ready.now = true;
    const later = press(`s:${m.message_id}`);
    await s.qa.onPress(later);
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]).toMatchObject({ chat: null, kind: "lost_funds", member: { id: null, username: "sam_doe" }, excerpt: "my buy failed and my ETH is gone" });
    expect(s.records.counts(GROUP_ID, NOW).escalated).toBe(1);
    expect(callsOf(s.out.log, "answerPress")[1]).toEqual([later.id, testWords.answer.shared]);
  });

  it("leaves Ask alone while the checks wait", async () => {
    const s = sharing({ now: false });
    const m = dm("how do fees work on tonkfun?");
    await s.qa.offerPrivate(m, m.text ?? "");
    const q = press(`a:${m.message_id}`);
    await s.qa.onPress(q);
    await settle();
    expect(callsOf(s.out.log, "answerPress")).toEqual([[q.id, undefined]]);
    expect(callsOf(s.out.log, "send")).toHaveLength(2);
  });
});
