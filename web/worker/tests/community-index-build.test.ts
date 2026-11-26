// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { createAiLimits } from "../src/telegram/claude/limits";
import { DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import type { CommunityConfig } from "../src/telegram/community/config";
import { buildCommunity } from "../src/telegram/community/index-build";
import type { AdminAlert } from "../src/telegram/community/types";
import type { CommunityDictionary } from "../src/telegram/community/words";
import type { TgCallbackQuery, TgMessage, TgUser } from "../src/telegram/types";
import { fakeData, OFFICIAL, packSource } from "./agent-answer-fixtures";
import { actionsOf, ADMIN_CHAT_ID, adminInfo, callsOf, fakeAdmins, GROUP_ID, groupMessage, memoryRecords, OWNER_ID, recordOut, testWords } from "./community-fixtures";
import { FORUM, ME, person, settle, SITE } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";

const CONFIG: CommunityConfig = {
  apiKey: null, chats: [GROUP_ID], adminChat: ADMIN_CHAT_ID, owners: [OWNER_ID], adminLang: "en", groupLang: "en", mode: "normal",
  budgetUsd: 3, answerModel: DEFAULT_ANSWER_MODEL, privateAi: true, userCodeKey: "a".repeat(64), allowedDomains: [], allowedBots: [], officialX: ["tonkfun"],
  helplineUrl: "https://findahelpline.com/", statePath: "/nowhere/community.json",
};

/**
 * A community built as community/index.ts builds it, on the rules alone (no model), with `config` patched and the placeholder words; `known` says
 * whether each group's admin list was confirmed, and `adminReady` whether the admin chat passed its checks.
 */
function bench(patch: Partial<CommunityConfig> = {}, words: (lang: Locale) => CommunityDictionary = () => testWords, known?: (chat: number) => boolean, adminReady?: () => boolean) {
  const out = recordOut();
  const alerts: AdminAlert[] = [];
  const admins = fakeAdmins({ [GROUP_ID]: [adminInfo(7_002)] }, [OWNER_ID]);
  const community = buildCommunity({
    config: { ...CONFIG, ...patch }, chats: [GROUP_ID], out, records: memoryRecords({ strictness: "normal" }), client: null, budget: null, limits: createAiLimits(),
    admins: known ? { ...admins, known } : admins, alerts: { alert: (a) => void alerts.push(a), tick: async () => undefined }, adminReady,
    pack: packSource(), data: fakeData(), official: OFFICIAL, allow: ALLOW, me: () => ME, teamChat: () => false, discussion: () => false,
    title: () => "tonkfun.fun community", rights: () => ({ delete: true, restrict: true }), prompt: async () => undefined, site: SITE, now: () => NOW,
    log: () => undefined, words,
  });
  return { out, alerts, community, send: (m: TgMessage) => community.pipeline.onMessage(m, false) };
}

const PROMO: TgUser = { id: 5_555, is_bot: true, first_name: "Promo", username: "promo_bot" };
const DRAINER = "Claim your TONK airdrop: tonkfun-claim.xyz";

describe("buildCommunity: TELEGRAM_ALLOWED_BOTS", () => {
  it("never moderates a bot the owner allowed, while any other bot's drainer link is removed and the bot banned", async () => {
    const allowed = bench({ allowedBots: ["promo_bot"] });
    await allowed.send(groupMessage(DRAINER, { from: PROMO }));
    await settle();
    expect(actionsOf(allowed.out.log)).toEqual([]);
    expect(allowed.alerts).toEqual([]);

    const other = bench({ allowedBots: ["other_bot"] });
    const m = groupMessage(DRAINER, { from: PROMO });
    await other.send(m);
    await settle();
    expect(callsOf(other.out.log, "remove")).toEqual([[GROUP_ID, [m.message_id]]]);
    expect(callsOf(other.out.log, "ban")).toEqual([[GROUP_ID, PROMO.id]]);
  });
});

describe("buildCommunity: the new-member check knows the bot by its ID", () => {
  it("leaves the bot's own join alone whatever username it shows, and bans a bot holding its username that a member added", async () => {
    const { out, alerts, community } = bench();
    const at = Math.floor(NOW / 1000);
    // members.ts drops the bot's own joins first; the check has its own guard, by the ID getMe gave.
    await community.newcomers.onJoin(GROUP_ID, [{ id: ME.id, is_bot: true, first_name: "TonkFun", username: "TonkfunNewBot" }], person(201), 83, at, NOW);
    await community.newcomers.onJoin(GROUP_ID, [{ id: 8_004, is_bot: true, first_name: "TonkFun", username: "TonkfunBot" }], person(201), 84, at, NOW);
    await settle();
    expect(callsOf(out.log, "ban")).toEqual([[GROUP_ID, 8_004]]);
    expect(alerts.map((a) => [a.category, a.undo])).toEqual([["bot_added", "ban"]]);
  });
});

describe("buildCommunity: someone at risk past the group's public pace", () => {
  const GERMAN: CommunityDictionary = { ...testWords, crisis: { body: "Es tut mir leid. Der Knopf findet eine Hotline.", button: "Hotline finden" } };

  it("gets the helpline reply alone, in their language and topic, as an ephemeral copy with nothing public; a chat posting gets none", async () => {
    const b = bench({}, (lang) => (lang === "de" ? GERMAN : testWords));
    const first = groupMessage("honestly i want to die, nothing works out for me", { chat: FORUM, from: person(201) });
    await b.send(first);
    await b.send(groupMessage("i want to die lol", { chat: FORUM, from: person(202, { language_code: "de-DE" }), is_topic_message: true, message_thread_id: 7 }));
    const channel = { id: -1_005_555_000_001, type: "channel" as const, title: "Some channel" };
    await b.send(groupMessage("i want to die lol", { chat: FORUM, sender_chat: channel, from: { id: 136_817_688, is_bot: true, first_name: "Channel" } }));
    await settle();
    expect(callsOf(b.out.log, "send")).toEqual([
      [GROUP_ID, testWords.crisis.body.replace("'", "'"), expect.objectContaining({ kind: "notice", replyTo: first.message_id })],
      [GROUP_ID, GERMAN.crisis.body, {
        kind: "notice", ephemeralTo: 202, ephemeralOnly: true, thread: 7,
        keyboard: { inline_keyboard: [[{ text: GERMAN.crisis.button, url: "https://findahelpline.com/" }]] },
      }],
    ]);
    // Each still reaches the team: the public reply's urgent alert, then one of their own.
    expect(b.alerts.map((a) => [a.kind, a.urgent])).toEqual([["crisis", true], ["crisis", true], ["crisis", true]]);
  });
});

describe("buildCommunity: a group dropped while it runs (wiring#1)", () => {
  it("leaves it, and ends its new-member checks and raid watch, each even when the other fails", () => {
    const { community } = bench();
    const checks = vi.fn(() => {
      throw new Error("boom");
    });
    const raid = vi.fn();
    Object.assign(community.newcomers, { dropChat: checks });
    Object.assign(community.raid, { dropChat: raid });
    community.drop(GROUP_ID);
    expect(community.owns(GROUP_ID)).toBe(false);
    expect(community.chats).toEqual([]);
    expect(checks).toHaveBeenCalledWith(GROUP_ID);
    expect(raid).toHaveBeenCalledWith(GROUP_ID);
  });
});

describe("buildCommunity: a group whose admin list Telegram never confirmed (wiring#3)", () => {
  const UNKNOWN = "New guide is up: https://some-unknown-site.example/guide";

  it("is moderated as in observe mode: a protective delete stands, an unknown link is only reported, and nobody is muted or warned", async () => {
    const b = bench({}, () => testWords, () => false);
    const unknown = groupMessage(UNKNOWN, { from: person(4_242) });
    const lookalike = groupMessage("everyone go to tonkfun-claim.xyz", { from: person(4_243) });
    await b.send(unknown);
    await b.send(lookalike);
    await settle();
    expect(callsOf(b.out.log, "remove")).toEqual([[GROUP_ID, [lookalike.message_id]]]);
    expect(callsOf(b.out.log, "restrict")).toEqual([]);
    expect(b.alerts.some((a) => a.kind === "observe")).toBe(true);
  });

  it("is moderated as set once the list is confirmed", async () => {
    const b = bench({}, () => testWords, () => true);
    const unknown = groupMessage(UNKNOWN, { from: person(4_242) });
    await b.send(unknown);
    await settle();
    expect(callsOf(b.out.log, "remove")).toEqual([[GROUP_ID, [unknown.message_id]]]);
  });
});

describe("buildCommunity: Share while the admin chat's checks wait (wiring#2)", () => {
  const ASKER = 301;
  /** Share on the private chat's escalated question (held as message 77), pressed by the asker in their own chat. */
  const share = (id: string): TgCallbackQuery => ({
    id, from: person(ASKER), data: "s:77",
    message: { message_id: 900, date: Math.floor(NOW / 1000), chat: { id: ASKER, type: "private" }, text: "Shared?", reply_markup: { inline_keyboard: [[{ text: "Share", callback_data: "s:77" }]] } },
  });

  it("tells the asker reports aren't set up yet and shares nothing, then shares the same question once the checks pass", async () => {
    let ready = false;
    const b = bench({}, () => testWords, undefined, () => ready);
    b.community.shares.put(ASKER, 77, { text: "my buy failed and the ETH is gone", lang: "en", escalate: "lost_funds", at: NOW });
    await b.community.qa.onPress(share("first"));
    expect(callsOf(b.out.log, "answerPress")).toEqual([["first", testWords.report.noAdminChat]]);
    expect(b.alerts).toEqual([]);
    ready = true;
    await b.community.qa.onPress(share("second"));
    expect(callsOf(b.out.log, "answerPress").at(-1)).toEqual(["second", testWords.answer.shared]);
    expect(b.alerts.map((a) => a.kind)).toEqual(["lost_funds"]);
  });
});
