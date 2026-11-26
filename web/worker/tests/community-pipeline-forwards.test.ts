// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TriageJob } from "../src/telegram/community/pipeline-triage";
import { heldDecision } from "../src/telegram/community/pipeline-triage-hold";
import type { Strictness } from "../src/telegram/community/types";
import { inlineArticle } from "../src/telegram/inline";
import type { TgMessage, TgMessageOrigin, TgUser } from "../src/telegram/types";
import { BOT, callsOf, GROUP, groupMessage, MEMBER } from "./community-fixtures";
import { ADMIN, GROUP_ID, harness, HOUR, ME, person, scripted, settle, SITE, testWords, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { token, WHOA } from "./telegram-fixtures";

/**
 * A member's forward whose author is known by the ID Telegram gives a user
 * forward (community/pipeline-mod-input.ts, mod/rules-forwards.ts): the
 * bot's own answers and cards (agent/triggers.ts forwardedFromMe) and an
 * admin's messages are never brand forwards, though named like the team, in
 * any mode, with Haiku's check or without one. An account holding the bot's
 * username, or someone named like an admin, under another ID still is.
 */

const MODES: readonly Strictness[] = ["observe", "relaxed", "normal", "strict"];
const LABEL = testWords.answer.label;
const from = (user: TgUser): TgMessageOrigin => ({ type: "user", date: 1, sender_user: user });

/** One of the bot's answers as a member's forward of it arrives: its label in italics, then the answer. */
const answerFrom = (user: TgUser): TgMessage =>
  groupMessage(`${LABEL}\nThe protocol fee is 1% of each curve trade, paid in ETH.`, { forward_origin: from(user), entities: [{ type: "italic", offset: 0, length: LABEL.length }] });

/** The bot's token card as a member's forward of it arrives, with the card's buttons. */
function cardFrom(user: TgUser): TgMessage {
  const card = inlineArticle(token(), "en", SITE);
  return groupMessage(card.input_message_content.message_text.replace(/<[^>]+>/g, ""), { forward_origin: from(user), reply_markup: card.reply_markup });
}

/** Nothing happened to the member: nothing removed, no note or warning, no mute, no alert, no offence. */
function untouched(h: ReturnType<typeof harness>): void {
  expect(h.removed()).toEqual([]);
  expect(h.sends()).toEqual([]);
  expect(callsOf(h.out.log, "restrict")).toEqual([]);
  expect(h.alerts).toEqual([]);
  expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n).toBe(0);
}

describe("the community pipeline: a member forwards the bot's own answers and cards", () => {
  it("removes nothing, and warns, mutes or reports no one, in every mode, with Haiku's check or without one", async () => {
    for (const mode of MODES) {
      for (const client of [null, scripted({ triage: verdict() })]) {
        const h = harness({ mode, client });
        // Twice each: in strict mode a second brand forward would mute the member.
        for (const m of [answerFrom(BOT), cardFrom(BOT), answerFrom(BOT), cardFrom(BOT)]) await h.send(m);
        await settle();
        untouched(h);
      }
    }
  });

  it("sends neither to Haiku's check: the bot wrote them, so its card's address is no member's (mod/triage.ts)", async () => {
    const h = harness({ client: scripted({ triage: verdict() }) });
    for (const m of [answerFrom(BOT), cardFrom(BOT)]) await h.send(m);
    await settle();
    expect(h.kinds()).toEqual([]);
    untouched(h);
  });

  it("still judges an account holding the bot's username by its name: its forward named like the team is removed", async () => {
    const h = harness({ client: null });
    const m = answerFrom({ ...BOT, id: 4_242 });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.alerts.map((a) => a.category)).toEqual(["brand_forward"]);
  });
});

describe("the community pipeline: a member forwards an admin's message", () => {
  const NOTE = "Maintenance tonight from 22:00 UTC";

  it("is never a brand forward, though the admin has no username and a role word in their name, in every mode", async () => {
    for (const mode of MODES) {
      // The harness's admin is "Alex Admin", with no username.
      const h = harness({ mode, client: null });
      for (const n of [1, 2]) await h.send(groupMessage(`${NOTE}, part ${n}`, { forward_origin: from(ADMIN) }));
      await settle();
      untouched(h);
    }
  });

  it("vouches for the admin's own account alone: anyone else of the same name is judged by it", async () => {
    const h = harness({ client: null });
    const m = groupMessage(NOTE, { forward_origin: from(person(4_243, { first_name: "Alex", last_name: "Admin" })) });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.alerts.map((a) => a.category)).toEqual(["brand_forward"]);
  });
});

describe("the community pipeline: relaxed mode and a member's link-free brand forward", () => {
  const NOTE = "The v2 migration is live today. Move your tokens before the old pool closes";
  const SUPPORT = person(4_243, { first_name: "TonkFun", last_name: "Support" });
  /** Another account holding the bot's username: not the bot. */
  const LOOKALIKE: TgUser = { ...BOT, id: 4_242 };

  it("keeps it up and tells the team, sending nothing new to Anthropic, from a team-like name or an account holding the bot's username", async () => {
    for (const author of [SUPPORT, LOOKALIKE]) {
      // Scripted to call it a scam, were it ever asked: the check never reads a message with nothing it looks for.
      const h = harness({ mode: "relaxed", client: scripted({ triage: verdict({ verdict: "scam", category: "impersonation", question: "none" }) }) });
      const m = groupMessage(NOTE, { forward_origin: from(author) });
      await h.send(m);
      await settle();
      expect(h.kinds()).toEqual([]);
      expect(h.removed()).toEqual([]);
      expect(h.sends()).toEqual([]);
      expect(callsOf(h.out.log, "restrict")).toEqual([]);
      expect(h.alerts.map((a) => [a.kind, a.category, a.messageId, a.done])).toEqual([["action", "brand_forward", m.message_id, null]]);
      expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n).toBe(0);
    }
  });

  it("removes it in a raid, as normal and strict modes always do", async () => {
    for (const mode of ["relaxed", "normal", "strict"] as const) {
      const h = harness({ mode, client: null, settings: mode === "relaxed" ? { raidUntil: NOW + HOUR } : {} });
      const m = groupMessage(NOTE, { forward_origin: from(SUPPORT) });
      await h.send(m);
      await settle();
      expect(h.removed(), mode).toEqual([m.message_id]);
      expect(h.alerts.map((a) => a.category), mode).toContain("brand_forward");
    }
  });
});

describe("a new member's hold: a forward of the bot's message is a user forward from the bot's ID (forwardedFromMe)", () => {
  /** Only what heldDecision reads: a new member's message the rules kept up, carrying an address the check couldn't read. */
  const job = (m: TgMessage) => ({ m, removed: false, hits: [], ctx: { strictness: "normal", standing: "new" }, result: { markers: { linkKeys: [WHOA] } } }) as unknown as TriageJob;
  const forward = (origin: unknown) => groupMessage(`Whoa the Tarsier · WHOA\n${WHOA}`, { forward_origin: origin as TgMessageOrigin });
  const HELD = { actions: [{ kind: "delete" }], category: "newcomer_link", offence: "none", notice: "removed" };

  it("leaves a user forward from the bot, and holds a forward of another type that carries the bot's user", () => {
    expect(heldDecision(job(forward(from(BOT))), ME)).toBeNull();
    const others = [
      { type: "chat", date: 1, sender_chat: GROUP, sender_user: BOT },
      { type: "hidden_user", date: 1, sender_user_name: "TonkFun", sender_user: BOT },
      { type: "channel", date: 1, chat: { id: -1_000_777, type: "channel", title: "TonkFun" }, sender_user: BOT },
    ];
    for (const origin of others) expect(heldDecision(job(forward(origin)), ME)).toMatchObject(HELD);
  });

  it("holds it too before the bot knows itself", () => {
    expect(heldDecision(job(forward(from(BOT))), null)).toMatchObject(HELD);
  });

  it("leaves whatever the rules marked as words the member didn't write: an admin's message or the official channel's post, by ID", () => {
    const m = forward(from(ADMIN));
    const marked = { ...job(m), result: { markers: { linkKeys: [WHOA], botsOwn: true } } } as unknown as TriageJob;
    expect(heldDecision(marked, ME)).toBeNull();
    expect(heldDecision(job(m), ME)).toMatchObject(HELD);
    // Nor an unknown link in them that relaxed mode keeps up: the check never reads it.
    const kept = { ...marked, ctx: { strictness: "relaxed", standing: "member" }, hits: [{ category: "unknown_link", severity: "alert", certain: false, detail: "" }] } as unknown as TriageJob;
    expect(heldDecision(kept, ME)).toBeNull();
    expect(heldDecision({ ...kept, result: { markers: { linkKeys: [] } } } as unknown as TriageJob, ME)).toMatchObject({ category: "unknown_link" });
  });
});
