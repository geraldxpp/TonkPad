// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createWho } from "../src/telegram/community/pipeline-who";
import type { TgUser } from "../src/telegram/types";
import { actionsOf, adminInfo, callsOf, fakeAdmins, groupMessage, memoryRecords, recordOut } from "./community-fixtures";
import { NOW } from "./fixtures";
import { ADMIN_ID, GROUP_ID, harness, S, settle } from "./community-pipeline-fixtures";

const PROMO: TgUser = { id: 5_555, is_bot: true, first_name: "Promo", username: "promo_bot" };
const DRAINER = "Claim your TONK airdrop: tonkfun-claim.xyz";

/** abuse#14: another bot in the group is read by the certain rules, unless the group made it an admin or allowed it. */
describe("the community pipeline: other bots", () => {
  it("deletes another bot's look-alike link and bans the bot, with an alert offering Unban, and never asks the model", async () => {
    const h = harness();
    const m = groupMessage(DRAINER, { from: PROMO });
    expect(await h.send(m)).toBe("handled");
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "ban")).toEqual([[GROUP_ID, PROMO.id]]);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: "action", undo: "ban", member: { id: PROMO.id } });
    expect(callsOf(h.out.log, "send")).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("does the same for an edit into a drainer link", async () => {
    const h = harness();
    const m = groupMessage("price update: all good", { from: PROMO });
    await h.send(m);
    await h.community.pipeline.onEdited({ ...m, text: DRAINER, edit_date: Math.floor(NOW / 1000) + 5 });
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "ban")).toEqual([[GROUP_ID, PROMO.id]]);
  });

  it("leaves another bot's other messages alone, an unknown link and a question included, and never answers them", async () => {
    const h = harness();
    await h.send(groupMessage("price update: coolcoin.xyz is up 5% today, how do you like it?", { from: PROMO }));
    await h.send(groupMessage("@TonkfunBot what is the fee?", { from: PROMO, entities: [{ type: "mention", offset: 0, length: 11 }] }));
    await settle();
    expect(actionsOf(h.out.log)).toEqual([]);
    expect(h.alerts).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("never moderates a bot the group made an admin", async () => {
    const h = harness({ admins: [adminInfo(ADMIN_ID), adminInfo(PROMO.id, { canDelete: false, canRestrict: false })] });
    await h.send(groupMessage(DRAINER, { from: PROMO }));
    await settle();
    expect(actionsOf(h.out.log)).toEqual([]);
  });

  it("only deletes a certain hit in a bot's message from while the worker was down, then sums it up", async () => {
    const h = harness({ client: null });
    const old = Math.floor(NOW / 1000) - 600;
    const m = groupMessage(DRAINER, { from: PROMO, date: old });
    expect(await h.send(m, true)).toBe("handled");
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(h.alerts).toEqual([]);
    await h.tick(NOW + 20 * S);
    expect(h.alerts.map((a) => a.kind)).toEqual(["action"]);
  });
});

describe("who wrote it: other bots", () => {
  const who = (allowedBots?: readonly string[]) =>
    createWho({
      out: recordOut(), records: memoryRecords(), admins: fakeAdmins({ [GROUP_ID]: [adminInfo(ADMIN_ID)] }), teamChat: () => false, discussion: () => false,
      groupLang: "en", strictness: () => "normal", allowedBots,
    });

  it("reads a bot in TELEGRAM_ALLOWED_BOTS as an admin, in any case, and any other as a member", async () => {
    const m = groupMessage(DRAINER, { from: PROMO });
    expect(await who(["promo_bot"]).of(m, NOW)).toMatchObject({ standing: "admin", bot: true, user: PROMO.id });
    expect(await who(["promo_bot"]).of(groupMessage("x", { from: { ...PROMO, username: "Promo_Bot" } }), NOW)).toMatchObject({ standing: "admin" });
    expect(await who().of(m, NOW)).toMatchObject({ standing: "member", bot: true });
    expect(await who(["other_bot"]).of(m, NOW)).toMatchObject({ standing: "member", bot: true });
  });
});
