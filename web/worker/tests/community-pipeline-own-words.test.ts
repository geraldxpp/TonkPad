// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STRICTNESS_LEVELS } from "../src/telegram/community/types";
import { inlineArticle } from "../src/telegram/inline";
import type { TgMessage } from "../src/telegram/types";
import { BOT, callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { DAY, GROUP_ID, harness, person, scripted, settle, SITE, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { token } from "./telegram-fixtures";

/**
 * The bot's own words a member posts or passes on (mod/rules-scan.ts
 * botsOwnOf): its token card through inline mode (via the bot, with its
 * Refresh button), and a forward of its message. The member didn't write
 * them: they never go to Haiku's check, whatever it would say, and what
 * they say never punishes anyone, though a card whose token name spells a
 * drainer's or a look-alike's site is still removed. The member's own name
 * and a flood still count.
 */

type How = "inline" | "forward";
const STANDINGS = ["member", "new"] as const;

/** The bot's card for a token named `name`, as Telegram delivers it posted through inline mode, or forwarded from the bot. */
function card(name: string, how: How, extra: Partial<TgMessage> = {}): TgMessage {
  const article = inlineArticle(token({ name }), "en", SITE);
  const text = article.input_message_content.message_text.replace(/<[^>]+>/g, "");
  const where: Partial<TgMessage> = how === "inline" ? { via_bot: BOT } : { forward_origin: { type: "user", date: 1, sender_user: BOT } };
  return groupMessage(text, { ...where, reply_markup: article.reply_markup, ...extra });
}

/** A harness whose checks would all say `kind`, with the member new when `standing` says so. */
function setUp(mode: (typeof STRICTNESS_LEVELS)[number], kind: "spam" | "scam" | null, standing: (typeof STANDINGS)[number]) {
  const client = kind === null ? null : scripted({ triage: verdict({ verdict: kind, category: kind === "scam" ? "phishing" : "promo", question: "none", reason: "Promises free ETH" }) });
  const h = harness({ mode, client });
  if (standing === "new") h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
  return h;
}

/** Nobody was punished: no offence, warning, mute, ban or removal from the group. */
function unpunished(h: ReturnType<typeof harness>, label: string): void {
  for (const call of ["restrict", "ban", "kick"] as const) expect(callsOf(h.out.log, call), `${label} ${call}`).toEqual([]);
  expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n, label).toBe(0);
}

describe("the community pipeline: the bot's own card, posted through inline mode or forwarded from the bot", () => {
  it("never goes to Haiku's check, so a spam or scam verdict can't remove it or punish anyone, in every mode", async () => {
    for (const mode of STRICTNESS_LEVELS) {
      for (const kind of ["spam", "scam"] as const) {
        for (const standing of STANDINGS) {
          const h = setUp(mode, kind, standing);
          const label = `${mode} ${kind} ${standing}`;
          // Twice each: a second spam verdict would mute the member.
          for (const how of ["inline", "forward", "inline", "forward"] as const) await h.send(card("FREE ETH AIRDROP claim now", how));
          await settle();
          expect(h.kinds(), label).toEqual([]);
          expect(h.removed(), label).toEqual([]);
          expect(h.sends(), label).toEqual([]);
          expect(h.alerts, label).toEqual([]);
          unpunished(h, label);
        }
      }
    }
  });

  it("is removed when its token's name spells a drainer's or a look-alike's site, but nobody is punished for it, in every mode", async () => {
    for (const mode of STRICTNESS_LEVELS) {
      for (const name of ["airdrop dot xyz", "tonkfun dot xyz"]) {
        for (const standing of STANDINGS) {
          for (const how of ["inline", "forward"] as const) {
            const h = setUp(mode, "scam", standing);
            const label = `${mode} ${name} ${standing} ${how}`;
            const sent = [card(name, how), card(name, how)];
            for (const m of sent) await h.send(m);
            await settle();
            // Even observe mode removes a drainer's or a look-alike's link: it protects members.
            expect(h.removed(), label).toEqual(sent.map((m) => m.message_id));
            expect(h.kinds(), label).toEqual([]);
            unpunished(h, label);
          }
        }
      }
    }
  });

  it("in observe mode removes the copy that floods too, that card alone, never the rest of the member's burst", async () => {
    for (const name of ["airdrop dot xyz", "tonkfun dot xyz"]) {
      // Nine cards in 10 seconds: the eighth floods (observe counts as normal mode, 7 at most).
      const h = setUp("observe", null, "member");
      const cards = Array.from({ length: 9 }, () => card(name, "inline"));
      for (const m of cards) await h.send(m);
      await settle();
      expect(h.removed().sort(), name).toEqual(cards.map((m) => m.message_id).sort());
      expect(h.alerts.map((a) => `${a.kind}:${a.category}`), name).toContain("observe:flood");
      unpunished(h, name);

      // The member's own words first, then the cards: the fifth card floods, and the burst's own words stay.
      const mixed = setUp("observe", null, "member");
      const words = ["gm", "gm all", "how is everyone today"].map((t) => groupMessage(t));
      const more = Array.from({ length: 6 }, () => card(name, "inline"));
      for (const m of [...words, ...more]) await mixed.send(m);
      await settle();
      expect(mixed.removed().sort(), `${name}, mixed`).toEqual(more.map((m) => m.message_id).sort());
      expect(mixed.alerts.map((a) => `${a.kind}:${a.category}`), `${name}, mixed`).toContain("observe:flood");
      unpunished(mixed, `${name}, mixed`);
    }
  });

  it("makes no raiders of new members who post the same card", async () => {
    const h = harness({ client: null });
    const ids = [301, 302, 303, 304];
    for (const id of ids) h.records.markNewcomer(GROUP_ID, id, NOW - 60_000, NOW + DAY);
    for (const id of ids) await h.send(card("airdrop dot xyz", "inline", { from: person(id) }));
    await settle();
    expect(h.removed()).toHaveLength(ids.length);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(h.alerts.map((a) => a.kind)).not.toContain("raid");
  });

  it("tells the team in relaxed mode of an unknown site a card spells, which the check would have read", async () => {
    const h = setUp("relaxed", "scam", "member");
    const m = card("claim free eth dot site", "inline");
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual([]);
    expect(h.removed()).toEqual([]);
    expect(h.alerts.map((a) => [a.kind, a.category, a.messageId])).toEqual([["action", "unknown_link", m.message_id]]);
    unpunished(h, "relaxed");
  });

  it("still mutes an impersonator who posts it, and a member who floods with it", async () => {
    const h = harness({ client: null });
    const m = card("Whoa the Tarsier", "inline", { from: { ...MEMBER, first_name: "TonkFun", last_name: "Support" } });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict").map((c) => c[1])).toEqual([MEMBER.id]);

    const flood = harness({ mode: "strict", client: null });
    for (let i = 0; i < 8; i += 1) await flood.send(card("Whoa the Tarsier", "inline"));
    await settle();
    expect(callsOf(flood.out.log, "restrict").map((c) => c[1])).toEqual([MEMBER.id]);
    expect(flood.records.offences(GROUP_ID, MEMBER.id, flood.clock.now)).toMatchObject({ n: 1, category: "flood" });
  });
});
