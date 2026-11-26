// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Markers, RuleResult } from "../src/telegram/community/types";
import { createCheckPace, MEMBER_CHECKS, printOf } from "../src/telegram/community/pipeline-triage-pace";
import { groupMessage } from "./community-fixtures";
import { NOW } from "./fixtures";

const GROUP = -1001234567890;
const S = 1_000;
const MINUTE = 60 * S;

const markers = (patch: Partial<Markers> = {}): Markers => ({
  question: false, domains: [], linkKeys: [], unknownLinks: 0, handles: 0, addresses: [],
  helpWords: false, dmWords: false, reportWords: false, crisis: null, words: 4, ...patch,
});
const result = (patch: Partial<Markers> = {}): RuleResult => ({ hits: [], markers: markers(patch) });

/** claude#2: one member's checks, and an edited message's, are paced so nobody can spend a group's checks. */
describe("the check's pace", () => {
  it("lets one member have 3 checks a minute in a group, and nobody else's are touched", () => {
    const pace = createCheckPace();
    for (let i = 0; i < MEMBER_CHECKS; i += 1) {
      expect(pace.room(GROUP, 101, NOW + i * S)).toBe(true);
      pace.use(GROUP, 101, 10 + i, NOW + i * S);
    }
    expect(pace.room(GROUP, 101, NOW + 5 * S)).toBe(false);
    expect(pace.room(GROUP, 102, NOW + 5 * S)).toBe(true);
    expect(pace.room(GROUP - 1, 101, NOW + 5 * S)).toBe(true);
    // A minute after the first, one is back.
    expect(pace.room(GROUP, 101, NOW + MINUTE)).toBe(true);
  });

  it("checks an edit only when what the check reads changed, and at most once a minute per message", () => {
    const pace = createCheckPace();
    const original = groupMessage("how do the fees work?");
    expect(pace.seen(GROUP, original.message_id, printOf(original, result({ question: true })), false, NOW)).toBe("new");
    pace.use(GROUP, 101, original.message_id, NOW);
    // The same words again (spacing and case aside), with the same findings: the verdict stands.
    const same = { ...original, text: "How do  the fees work?", edit_date: Math.floor(NOW / 1000) + 2 };
    expect(pace.seen(GROUP, original.message_id, printOf(same, result({ question: true })), true, NOW + 2 * S)).toBe("same");
    // Changed, but checked under a minute ago: not now, and the change still counts later.
    const changed = { ...original, text: "how do the fees work? DM me for help", edit_date: Math.floor(NOW / 1000) + 4 };
    const print = printOf(changed, result({ question: true, dmWords: true }));
    expect(pace.seen(GROUP, original.message_id, print, true, NOW + 4 * S)).toBe("soon");
    expect(pace.seen(GROUP, original.message_id, print, true, NOW + MINUTE + S)).toBe("changed");
    pace.use(GROUP, 101, original.message_id, NOW + MINUTE + S);
    expect(pace.seen(GROUP, original.message_id, print, true, NOW + 2 * MINUTE + 2 * S)).toBe("same");
  });

  it("reads a change in what the rules found even when the words stay, such as a link behind the same text", () => {
    const m = groupMessage("click here for the docs");
    const before = printOf(m, result());
    const after = printOf({ ...m, edit_date: 1 }, result({ domains: ["evil-site.xyz"], unknownLinks: 1 }));
    expect(after).not.toBe(before);
    expect(before).toMatch(/^[0-9a-f]{32}$/);
  });

  it("checks an edit of a message it never saw, or saw over 10 minutes ago", () => {
    const pace = createCheckPace();
    expect(pace.seen(GROUP, 77, "a", true, NOW)).toBe("changed");
    pace.use(GROUP, 101, 77, NOW);
    expect(pace.seen(GROUP, 77, "b", true, NOW + 11 * MINUTE)).toBe("changed");
  });

  it("forgets members after a minute and messages after 10 minutes", () => {
    const pace = createCheckPace();
    pace.use(GROUP, 101, 1, NOW);
    pace.seen(GROUP, 1, "a", false, NOW);
    pace.prune(NOW + 2 * MINUTE);
    expect(pace.room(GROUP, 101, NOW + 2 * MINUTE)).toBe(true);
    expect(pace.seen(GROUP, 1, "a", true, NOW + 2 * MINUTE)).toBe("same");
    pace.prune(NOW + 10 * MINUTE);
    expect(pace.seen(GROUP, 1, "a", true, NOW + 10 * MINUTE)).toBe("changed");
  });
});
