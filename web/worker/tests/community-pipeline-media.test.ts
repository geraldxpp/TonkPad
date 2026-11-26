// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inlineArticle } from "../src/telegram/inline";
import type { TgMessage, TgUser } from "../src/telegram/types";
import { BOT, callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, settle } from "./community-pipeline-fixtures";
import { SITE, token } from "./telegram-fixtures";

const PROMO: TgUser = { id: 5, is_bot: true, first_name: "Promo", username: "promo_bot" };
const markup = (url: string) => ({ inline_keyboard: [[{ text: "Claim", url }]] }) as unknown as TgMessage["reply_markup"];

/** What the pipeline hands the rules and the flood watch from a message's buttons, albums and the bot's own cards (mod/media.ts). */
describe("the community pipeline: buttons, albums and the bot's own cards", () => {
  it("removes a member's message whose link button points at a drainer", async () => {
    const h = harness({ client: null });
    const m = groupMessage("Claim your TONK reward below", { via_bot: PROMO, reply_markup: markup("https://tonkfun-claim.xyz") });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.alerts.map((a) => a.category)).toEqual(["lookalike"]);
  });

  it("leaves a new member's share of the bot's own inline card alone", async () => {
    const h = harness({ client: null });
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    const card = inlineArticle(token(), "en", SITE);
    const m = groupMessage(card.input_message_content.message_text.replace(/<[^>]+>/g, ""), { via_bot: BOT, reply_markup: card.reply_markup });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([]);
  });

  it("counts an album of 8 photos as one message, never a flood", async () => {
    const h = harness({ client: null });
    for (let i = 0; i < 8; i += 1) await h.send(groupMessage("", { media_group_id: "13579", photo: [{ file_id: `p${i}`, file_unique_id: `u${i}`, width: 1, height: 1 }] } as Partial<TgMessage>));
    await settle();
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
  });
});
