import { describe, expect, it } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import type { NameRiskInput } from "../src/telegram/mod/newcomers";
import { callsOf, GROUP_ID, OWNER_ID } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, flush, MINUTE, person, press, SECOND, setup, unix } from "./mod-newcomers-setup";

describe("the new-member check: who joins", () => {
  it("bans a bot a member added, keeps one an admin added or one that is allowed", async () => {
    const { out, alerts, join } = setup();
    const spam = { id: 8_001, is_bot: true, first_name: "Spam", username: "spammybot" };
    await join([spam], 80, NOW, person(201));
    await join([{ id: 8_002, is_bot: true, first_name: "Helper", username: "OtherHelperBot" }], 81, NOW, person(OWNER_ID));
    await join([{ id: 8_003, is_bot: true, first_name: "Good", username: "GoodHelperBot" }], 82, NOW, person(201));
    await join([{ id: 9_000, is_bot: true, first_name: "TonkFun", username: "TonkfunBot" }], 83, NOW, person(201));
    await flush();
    expect(callsOf(out.log, "ban")).toEqual([[GROUP_ID, 8_001]]);
    expect(callsOf(out.log, "send")).toEqual([]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "action", category: "bot_added", undo: "ban" })]);
  });

  it("in observe mode only marks newcomers new, and never restricts", async () => {
    const { out, records, join } = setup({ strictness: "observe" });
    await join([person(201)], 71, NOW);
    await join([{ id: 8_001, is_bot: true, first_name: "Spam", username: "spammybot" }], 80, NOW);
    await flush();
    expect(callsOf(out.log, "restrict")).toEqual([]);
    expect(callsOf(out.log, "send")).toEqual([]);
    expect(callsOf(out.log, "ban")).toEqual([]);
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 2 * DAY)).toBe(true);
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 3 * DAY)).toBe(false);
  });

  it("only marks joins older than 5 minutes", async () => {
    const { out, records, joins, newcomers } = setup();
    await newcomers.onJoin(GROUP_ID, [person(201)], null, 71, unix(NOW - 10 * MINUTE), NOW);
    expect(callsOf(out.log, "restrict")).toEqual([]);
    expect(callsOf(out.log, "send")).toEqual([]);
    expect(records.isNewcomer(GROUP_ID, 201, NOW)).toBe(true);
    expect(joins).toEqual([]);
  });

  it("removes a name with a link at once, and keeps an impersonating name muted for 7 days after passing", async () => {
    const nameRisk = (input: NameRiskInput) => (input.name.includes("t.me") ? "link" : input.name.includes("Support") ? "impersonation" : null);
    const { out, records, alerts, newcomers, join } = setup({ nameRisk });
    await join([person(401, { first_name: "Join t.me/scamgroup" })], 90, NOW);
    await flush();
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 401]]);
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [90]]]);
    expect(callsOf(out.log, "send")).toEqual([]);

    const fake = person(402, { first_name: "TonkFun Support" });
    await join([fake], 91, NOW);
    await newcomers.onPress(press(fake, "h:0", 5001), NOW + SECOND);
    await flush();
    expect(callsOf(out.log, "answerPress").at(-1)).toEqual(["q402:h:0", undefined]);
    expect(callsOf(out.log, "restrict").at(-1)).toEqual([GROUP_ID, 402, MUTED, unix(NOW) + 7 * 86_400]);
    expect(alerts.at(-1)).toMatchObject({ kind: "action", category: "impersonation", undo: "mute", member: { id: 402, name: "TonkFun Support" } });
    expect(records.offences(GROUP_ID, 402, NOW)).toMatchObject({ n: 1, certain: 0 });
  });

  it("checks names with mod/names.ts when none is passed in", async () => {
    const { out, join } = setup({ nameRisk: undefined });
    await join([person(401, { first_name: "Join t.me/scamgroup" })], 90, NOW);
    await join([person(402)], 91, NOW);
    await flush();
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 401]]);
    expect(callsOf(out.log, "send")).toHaveLength(1);
  });

  it("drops a newcomer who leaves from the check, deleting it with the last", async () => {
    const { out, records, newcomers, join } = setup();
    await join([person(201), person(202)], 71, NOW);
    records.forgetMember(GROUP_ID, 201);
    newcomers.onLeave(GROUP_ID, 201);
    await flush();
    expect(callsOf(out.log, "edit").at(-1)?.[2]).not.toContain("id=201");
    newcomers.onLeave(GROUP_ID, 202);
    await flush();
    expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
  });
});
