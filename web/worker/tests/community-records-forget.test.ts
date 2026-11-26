// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GROUP_ID } from "./community-fixtures";
import { check, DAY, KIM, LEE, MINUTE, NAME, OTHER_GROUP, SAM, setup } from "./community-records-setup";
import { NOW } from "./fixtures";

/** A group setup finds for certain the bot is no longer in (left, or removed): records.forgetChat, for setup to call. */
describe("community records of a group the bot left", () => {
  it("forgets every member's record in one group the bot is no longer in, trusted members included, though it is still allow-listed", () => {
    const { records, state, saves } = setup();
    for (const chat of [GROUP_ID, OTHER_GROUP]) {
      records.addOffence(chat, SAM, NOW, "invite_link", true);
      records.markNewcomer(chat, KIM, NOW, NOW + DAY);
      records.setPending(check(LEE, { chat }));
      records.setPending(check(404, { chat, messageId: 0 }));
      records.trust(chat, SAM, NAME, NOW);
      records.markAppeal(chat, SAM, NOW);
      records.count(chat, "removed", NOW);
      records.updateSettings(chat, { strictness: "strict" });
    }
    records.scheduleDelete(OTHER_GROUP, 900, NOW + MINUTE);
    const before = saves();
    // Setup found for certain that the bot left OTHER_GROUP (or was removed); the allow-list still names both.
    records.forgetChat(OTHER_GROUP);
    expect(saves()).toBe(before + 1);
    for (const map of [state.warnings, state.newcomers, state.trusted, state.appeals]) {
      expect(map[String(OTHER_GROUP)]).toBeUndefined();
      expect(map[String(GROUP_ID)]).toBeDefined();
    }
    expect(Object.keys(state.pending)).toEqual([`${GROUP_ID}:${LEE}`, `${GROUP_ID}:404`]);
    expect(records.trusted(OTHER_GROUP)).toEqual([]);
    // Its settings and day counts (no IDs) stay, as for a group taken off the list; so do the bot's own deletes there.
    expect(records.settings(OTHER_GROUP).strictness).toBe("strict");
    expect(records.counts(OTHER_GROUP, NOW).removed).toBe(1);
    expect(state.deletes.map((d) => d.messageId)).toEqual([900]);
    records.forgetChat(OTHER_GROUP);
    records.forgetChat(-1_007_777_777_777);
    expect(saves()).toBe(before + 1);
    // No time limit would ever have dropped these: trusted members stay in the group still run.
    records.prune(NOW + 365 * DAY);
    expect(records.trusted(GROUP_ID)).toEqual([SAM]);
  });
});
