// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createCrisisGate } from "../src/telegram/community/pipeline-crisis";
import type { Who } from "../src/telegram/community/pipeline-who";
import type { AdminAlert } from "../src/telegram/community/types";
import { inlineArticle } from "../src/telegram/inline";
import type { TgMessage } from "../src/telegram/types";
import { BOT, callsOf, GROUP_ID, groupMessage, MEMBER, memoryRecords, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { harness, person, scripted, settle, SITE, verdict } from "./community-pipeline-fixtures";
import { token } from "./telegram-fixtures";

const S = 1_000;
const MINUTE = 60 * S;

const who = (id: number): Who => ({ standing: "member", user: id, senderChat: null, name: `Member${id}`, username: null, tag: null, lang: "en", trustedName: false });
const said = (id: number): TgMessage => groupMessage("i want to die lol, check spam-site.xyz", { from: { id, is_bot: false, first_name: `Member${id}` } });

function setup() {
  let now = NOW;
  const reply = vi.fn<(m: TgMessage) => Promise<void>>(async () => undefined);
  const copy = vi.fn<(m: TgMessage) => void>();
  const alerts: AdminAlert[] = [];
  const records = memoryRecords({ strictness: "normal" });
  const gate = createCrisisGate({ reply, copy, alerts: { alert: (a) => void alerts.push(a) }, records, adminWords: () => testWords, now: () => now });
  return { gate, reply, copy, alerts, records, at: (ms: number) => (now = ms) };
}

/** injection#2: someone at risk always reaches the team, but a self-harm phrase pasted under spam can't flood the group or the admin chat. */
describe("the crisis reply's pace", () => {
  it("replies in public at most once per group every 5 minutes; past that, to the poster alone, with an urgent alert of its own", () => {
    const s = setup();
    s.gate.crisis(said(201), who(201));
    s.gate.crisis(said(202), who(202));
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect(s.copy).toHaveBeenCalledTimes(1);
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]).toMatchObject({ chat: GROUP_ID, kind: "crisis", category: "crisis", urgent: true, routine: false, member: { id: 202 } });
    expect(s.alerts[0].excerpt).toContain("i want to die");
    expect(s.records.counts(GROUP_ID, NOW)).toMatchObject({ crisis: 1, escalated: 1 });
    s.at(NOW + 5 * MINUTE);
    s.gate.crisis(said(203), who(203));
    expect(s.reply).toHaveBeenCalledTimes(2);
  });

  it("answers each member once per 10 minutes", () => {
    const s = setup();
    for (let i = 0; i < 5; i += 1) {
      s.at(NOW + i * S);
      s.gate.crisis(said(201), who(201));
    }
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.alerts).toEqual([]);
  });

  it("sends at most 3 urgent alerts a minute per group, then one urgent summary of the rest a minute later", () => {
    const s = setup();
    for (let i = 0; i < 30; i += 1) {
      s.at(NOW + i * 100);
      s.gate.crisis(said(300 + i), who(300 + i));
    }
    // The public reply's own alert, then two more.
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect(s.alerts).toHaveLength(2);
    expect(s.copy).toHaveBeenCalledTimes(29);
    s.gate.tick(NOW + 30 * S);
    expect(s.alerts).toHaveLength(2);
    s.gate.tick(NOW + 2 * S + MINUTE);
    expect(s.alerts).toHaveLength(3);
    expect(s.alerts[2]).toMatchObject({ kind: "crisis", urgent: true, member: null, excerpt: null, done: `${testWords.admin.counters.crisis}: 27` });
    // Every member still counts.
    expect(s.records.counts(GROUP_ID, NOW).crisis).toBe(29);
  });

  it("keeps each group's pace apart, and never throws", () => {
    const s = setup();
    const other = { ...said(401), chat: { id: GROUP_ID - 1, type: "supergroup" as const } };
    s.gate.crisis(said(201), who(201));
    s.gate.crisis(other, who(401));
    expect(s.reply).toHaveBeenCalledTimes(2);
    const broken = createCrisisGate({ reply: () => Promise.reject(new Error("boom")), alerts: { alert: () => undefined }, records: memoryRecords(), adminWords: () => testWords, now: () => NOW });
    expect(() => broken.crisis(said(1), who(1))).not.toThrow();
  });
});

/** injection#2 and injection#4 in the pipeline: a self-harm phrase means never punished, not never moderated. */
describe("the community pipeline: someone at risk", () => {
  const RISK = "i want to die lol";

  it("still sends an unknown link to the check, whose scam verdict deletes it without a mute", async () => {
    const h = harness({ mode: "relaxed", client: scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none" }) }) });
    const m = groupMessage(`new checker for your wallet: wallet-checker-pro.xyz ${RISK}`);
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    expect(h.sends().filter((s) => s[1] === testWords.crisis.body)).toHaveLength(1);
  });

  it("deletes a flood burst without a mute, and replies once", async () => {
    const h = harness({ client: null });
    const burst = Array.from({ length: 9 }, (_, i) => groupMessage(`${RISK} number ${i}`));
    for (const m of burst) await h.send(m);
    await settle();
    // The burst floods at its 8th message; the 9th is the rest of it, deleted as it comes (rules#6).
    expect(new Set(h.removed())).toEqual(new Set(burst.map((m) => m.message_id)));
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    expect(h.sends().filter((s) => s[1] === testWords.crisis.body)).toHaveLength(1);
  });

  it("still counts the same link from several accounts as a raid, deleting the copies without a ban", async () => {
    const h = harness({ client: null });
    for (const id of [301, 302, 303]) h.records.markNewcomer(GROUP_ID, id, NOW - 60_000, NOW + 86_400_000);
    for (const id of [301, 302, 303]) await h.send(groupMessage(`coolcoin.xyz/pump ${RISK}`, { from: person(id) }));
    await settle();
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
    expect(new Set(h.removed()).size).toBe(3);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    // One public reply per group every 5 minutes: the other two get it to themselves alone, nothing in public.
    const replies = h.sends().filter((s) => s[1] === testWords.crisis.body);
    expect(replies.filter((s) => s[2].ephemeralTo === undefined)).toHaveLength(1);
    expect(replies.filter((s) => s[2].ephemeralTo !== undefined).map((s) => s[2])).toEqual([
      expect.objectContaining({ ephemeralTo: 302, ephemeralOnly: true }),
      expect.objectContaining({ ephemeralTo: 303, ephemeralOnly: true }),
    ]);
    expect(h.alerts.filter((a) => a.kind === "crisis" && a.urgent)).toHaveLength(3);
  });

  it("applies a scam verdict's delete when the check also flags a crisis, then replies, never punishing", async () => {
    const h = harness({ client: scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none", needs_human: "crisis" }) }) });
    const m = groupMessage("Big promo from the team today: send 0.1 ETH to 0x2222222222222222222222222222222222222222 and you get 0.3 ETH back. I can't go on like this");
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    expect(h.sends().filter((s) => s[1] === testWords.crisis.body)).toHaveLength(1);
    expect(h.alerts.map((a) => [a.kind, a.urgent]).sort()).toEqual([["action", false], ["crisis", true]]);
  });

  it("holds a relaxed member's kept link when the check flags a crisis with a spam verdict", async () => {
    const h = harness({ mode: "relaxed", client: scripted({ triage: verdict({ verdict: "spam", category: "link_spam", question: "none", needs_human: "crisis" }) }) });
    const m = groupMessage("check out coolcoin.xyz for gains, nothing matters anymore");
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    expect(h.sends().filter((s) => s[1] === testWords.crisis.body)).toHaveLength(1);
  });
});

/** The bot's own words a member posts or passes on (mod/rules-scan.ts botsOwnOf): they didn't write them, so they never set off the crisis flow. */
describe("the community pipeline: the bot's own words with a self-harm phrase", () => {
  /** The bot's card for a token named "I want to die" (its creator chose the name), posted through inline mode, or forwarded from the bot. */
  function ownWords(how: "inline" | "forward"): TgMessage {
    const article = inlineArticle(token({ name: "I want to die" }), "en", SITE);
    const text = article.input_message_content.message_text.replace(/<[^>]+>/g, "");
    const where: Partial<TgMessage> = how === "inline" ? { via_bot: BOT, reply_markup: article.reply_markup } : { forward_origin: { type: "user", date: 1, sender_user: BOT } };
    return groupMessage(text, where);
  }

  it("gets no crisis reply and no urgent alert, posted, forwarded or edited, and nobody is checked or punished; the member's own words still get it", async () => {
    const h = harness({ client: scripted({ triage: verdict() }) });
    const posted = [ownWords("inline"), ownWords("forward")];
    for (const m of posted) await h.send(m);
    for (const m of posted) await h.community.pipeline.onEdited({ ...m, edit_date: Math.floor(NOW / 1000) });
    await settle();
    expect([h.sends(), h.alerts, h.kinds(), h.removed()]).toEqual([[], [], [], []]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.counts(GROUP_ID, NOW).crisis ?? 0).toBe(0);
    await h.send(groupMessage("i want to die"));
    await settle();
    expect(h.sends().filter((s) => s[1] === testWords.crisis.body)).toHaveLength(1);
    expect(h.alerts.map((a) => [a.kind, a.urgent])).toEqual([["crisis", true]]);
  });
});
