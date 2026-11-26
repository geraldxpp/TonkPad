// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CommunityHooks } from "../src/telegram/community/types";
import { en } from "../src/telegram/i18n/en";
import { inlineLimits } from "../src/telegram/inline";
import { ANSWER_MS, QUIET_MS } from "../src/telegram/inline-wait";
import { handleUpdate } from "../src/telegram/router";
import type { TgUpdate } from "../src/telegram/types";
import { ME } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { actingCalls, context, stubHooks, WHOA } from "./telegram-fixtures";
import { liveCommunity, routed, settle } from "./telegram-fixtures-community";
import { ASK_G, ASK_P, asking, CHAT_TYPES, production, query, testClock } from "./telegram-inline-fixtures";

/**
 * Where inline mode offers its Ask result (inline.ts) and how often it
 * answers: Ask only in a supergroup or the bot's own chat while AI answers
 * there; at the production limits (inline-wait.ts inlineLimits), a person's
 * text is answered once they pause, a person's lookups and their typing
 * each have an allowance, and lookups and text each a shared budget a
 * second, so people typing can't hold up a lookup.
 */

/** How many Ask results one question gets in each of CHAT_TYPES, with these community hooks (none: no community agent). */
async function offered(community?: CommunityHooks): Promise<number[]> {
  const { ctx, got } = context({}, NOW, community ? { community } : {});
  for (const type of CHAT_TYPES) await handleUpdate(query("how do creator locks work?", type), ctx);
  return got.inline.map((a) => a.results.length);
}

describe("where inline mode offers Ask", () => {
  it("only in a supergroup while the community agent answers in its groups, and in the bot's own chat while private AI is on", async () => {
    expect(await offered(stubHooks())).toEqual([1, 0, 1, 0, 0, 0]);
    expect(await offered({ ...stubHooks(), groupAi: () => false })).toEqual([1, 0, 0, 0, 0, 0]);
    expect(await offered({ ...stubHooks({ ai: false }), groupAi: () => true })).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it("nowhere without the community agent, with AI off, or when the agent can't say; a card stays module 14's, in any chat", async () => {
    expect(await offered()).toEqual([0, 0, 0, 0, 0, 0]);
    expect(await offered(stubHooks({ ai: false }))).toEqual([0, 0, 0, 0, 0, 0]);
    const broken: CommunityHooks = { ...stubHooks(), aiOn: () => { throw new Error("down"); } };
    expect(await offered(broken)).toEqual([0, 0, 0, 0, 0, 0]);
    const { ctx, got } = context();
    for (const type of CHAT_TYPES) await handleUpdate(query(WHOA, type), ctx);
    expect(got.inline.map((a) => a.results.map((r) => r.id))).toEqual(CHAT_TYPES.map(() => [WHOA]));
  });

  it("never reaches the community agent or the model: it only asks whether AI is on", async () => {
    const { ctx, got, spy } = routed();
    await handleUpdate(query("what is the launch fee?"), ctx);
    expect(actingCalls(spy.calls)).toEqual([]);
    expect(new Set(spy.calls.map((c) => c.name))).toEqual(new Set(["aiOn"]));
    expect(got.inline[0].results.map((r) => r.id)).toEqual([ASK_G]);
    const live = liveCommunity();
    try {
      const run = context({}, NOW, { community: live.hooks, me: () => ME, bot: () => "TonkfunBot" });
      await handleUpdate(query("what is the launch fee?", "sender"), run.ctx);
      await settle();
      expect(run.got.inline[0].results.map((r) => r.id)).toEqual([ASK_P]);
      expect(live.client.calls).toEqual([]);
    } finally {
      live.hooks.stop();
    }
  });
});

/** A 38-character question as Telegram sends it while it is typed: 25 queries, each a little longer, the last the whole question. */
const TYPED = "how long does a creator lock last for?";
const typing = Array.from({ length: 25 }, (_, i) => TYPED.slice(0, Math.ceil(((i + 1) * TYPED.length) / 25)));
/** The questions an answer's Ask results stand for, by their titles (the post is always the fixed line). */
const askedText = (answer: { results: Array<{ title: string }> } | undefined) => answer?.results.map((r) => r.title.replace(/^Ask TonkFun: /, ""));

describe("how often inline mode answers, at the production limits", () => {
  it("answers one person typing at one query per 400 ms at each pause, the finished question with its Ask", async () => {
    expect(TYPED.length).toBe(38);
    const { got, send, ctx } = production();
    await send(typing, 400);
    expect(got.inline).toHaveLength(25);
    expect(askedText(got.inline[24])).toEqual([TYPED]);
    expect(ctx.inlineTyping?.size).toBe(0);
  });

  it("answers a burst typed faster than a pause once, for its newest query, and counts only that against the person's allowance", async () => {
    const { got, send, pass } = production();
    await send(Array.from({ length: 60 }, (_, i) => `${TYPED} ${i}`), 100);
    expect(got.inline).toEqual([]);
    await pass(QUIET_MS);
    expect(got.inline.map(askedText)).toEqual([[`${TYPED} 59`]]);
    // 60 queries typed, one answered: 29 more of the 30 a person has in 10 s are still there.
    await send(Array<string>(29).fill(TYPED), QUIET_MS + 10);
    expect(got.inline).toHaveLength(30);
  });

  it("answers five people typing at one query per 400 ms with each one's finished Ask, side by side or 130 ms apart, and a lookup at once", async () => {
    for (const offset of [0, 130]) {
      const time = testClock();
      const { ctx, got } = asking({ ...inlineLimits(time.later), now: time.now });
      const sent = new Map<string, number>();
      const events = [1, 2, 3, 4, 5].flatMap((typist) => typing.map((text, i) => ({ at: (typist - 1) * offset + i * 400, typist, text })));
      for (const event of events.sort((a, b) => a.at - b.at)) {
        await time.pass(NOW + event.at - time.now());
        const update: TgUpdate = query(event.text, "supergroup", "en", 1_000 + event.typist);
        if (event.text === TYPED) sent.set(update.inline_query?.id ?? "", event.typist);
        await handleUpdate(update, ctx);
        if (event.typist === 5 && event.text === typing[12]) {
          await handleUpdate(query(WHOA, "supergroup", "en", 6), ctx);
          expect(got.inline.at(-1)?.results.map((r) => r.id)).toEqual([WHOA]);
        }
      }
      await time.pass(ANSWER_MS);
      expect(sent.size).toBe(5);
      for (const id of sent.keys()) expect(askedText(got.inline.find((a) => a.id === id)), `${offset}: ${id}`).toEqual([TYPED]);
    }
  });

  it("answers ten people starting at random within 3 s, past everyone's budget, each one's finished Ask within 5 s", async () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    const time = testClock();
    const { ctx, got } = asking({ ...inlineLimits(time.later), now: time.now });
    const finished = new Map<string, number>();
    const events = Array.from({ length: 10 }, (_, typist) => {
      const start = Math.floor(random() * 3_000);
      return typing.map((text, i) => ({ at: start + i * 400 + Math.floor(random() * 100) - 50, typist, text }));
    }).flat();
    for (const event of events.sort((a, b) => a.at - b.at)) {
      await time.pass(Math.max(0, NOW + event.at - time.now()));
      const update = query(event.text, "supergroup", "en", 2_000 + event.typist);
      if (event.text === TYPED) finished.set(update.inline_query?.id ?? "", time.now());
      await handleUpdate(update, ctx);
    }
    await time.pass(ANSWER_MS);
    for (const id of finished.keys()) expect(askedText(got.inline.find((a) => a.id === id)), id).toEqual([TYPED]);
  });

  it("keeps 5 lookups a person in 10 s apart from their typing, and counts their text where Ask isn't offered as lookups", async () => {
    const one = production();
    await one.send(Array<string>(7).fill(WHOA), 200);
    expect(one.got.inline).toHaveLength(5);
    await one.send(["what is the launch fee?"], 400);
    expect(askedText(one.got.inline[5])).toEqual(["what is the launch fee?"]);
    await one.pass(10_000);
    await one.send([WHOA], 200);
    expect(one.got.inline).toHaveLength(7);
    // In a basic group, which Ask never answers, each pause's answer (the help) counts as a lookup does, 5 in 10 s.
    const other = production();
    await other.send(Array<string>(7).fill("what is the launch fee?"), 400, "group");
    expect(other.got.inline.map((a) => a.help)).toEqual(Array<string>(5).fill(en.inline.help));
  });

  it("keeps everyone's lookups to 10 answers a second and everyone's text to 12, each apart; text past it waits for the budget", async () => {
    const all = production();
    for (let user = 1; user <= 15; user += 1) await handleUpdate(query("what is the launch fee?", "supergroup", "en", user), all.ctx);
    for (let user = 1; user <= 12; user += 1) await handleUpdate(query(WHOA, "supergroup", "en", 100 + user), all.ctx);
    expect(all.got.inline.map((a) => a.results[0]?.id)).toEqual(Array<string>(10).fill(WHOA));
    await all.pass(QUIET_MS);
    expect(all.got.inline).toHaveLength(22);
    await all.pass(1_000);
    expect(all.got.inline.filter((a) => a.results[0]?.id === ASK_G)).toHaveLength(15);
  });

  it("lets a lookup supersede the person's waiting text, and holds no one's text once it is answered or the bot stops", async () => {
    const run = production();
    await handleUpdate(query("what is the launch fee?"), run.ctx);
    await handleUpdate(query(WHOA), run.ctx);
    await run.pass(ANSWER_MS);
    expect(run.got.inline.map((a) => a.results.map((r) => r.id))).toEqual([[WHOA]]);
    await handleUpdate(query("what is the launch fee?"), run.ctx);
    expect(run.ctx.inlineTyping?.size).toBe(1);
    run.ctx.inlineTyping?.stop();
    await run.pass(ANSWER_MS);
    expect(run.got.inline).toHaveLength(1);
    expect(run.ctx.inlineTyping?.size).toBe(0);
  });
});
