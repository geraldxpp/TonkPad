// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ClaudeClient, ClaudeOutcome } from "../src/telegram/claude/types";
import { failure, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { GROUP_ID, harness, person, S, settle, verdict } from "./community-pipeline-fixtures";

/** A client whose checks answer only when the test says so, in order. */
function heldClient(): ClaudeClient & { release(outcome: ClaudeOutcome): void; waiting(): number } {
  const pending: Array<(outcome: ClaudeOutcome) => void> = [];
  return {
    create: () => new Promise<ClaudeOutcome>((resolve) => void pending.push(resolve)),
    countTokens: async () => null,
    release: (outcome) => pending.shift()?.(outcome),
    waiting: () => pending.length,
  };
}

/** robustness#8: a check that waited past its minute holds a relaxed member's unknown link, like a failed one. */
describe("the community pipeline: checks that come late", () => {
  it("holds the links of checks dropped past their minute in relaxed mode", async () => {
    const client = heldClient();
    const h = harness({ mode: "relaxed", client });
    const links = Array.from({ length: 10 }, (_, i) => groupMessage(`check out coolcoin${i}.xyz for gains`, { from: person(300 + i) }));
    for (const m of links) await h.send(m);
    await settle();
    // Four checks run (and hang), six wait; nothing is held yet.
    expect(client.waiting()).toBe(4);
    expect(h.removed()).toEqual([]);
    h.clock.now = NOW + 61 * S;
    h.community.checks.prune();
    await settle();
    expect(h.community.checks.stats().dropped).toBe(6);
    expect(h.records.counts(GROUP_ID, NOW).held).toBe(6);
    expect(new Set(h.removed())).toEqual(new Set(links.slice(4).map((m) => m.message_id)));
    for (let i = 0; i < 4; i += 1) client.release(failure("timeout"));
    await settle();
    expect(h.records.counts(GROUP_ID, NOW).held).toBe(10);
  });
});

/** privacy#7: a late verdict records nothing for someone who left the group meanwhile. */
describe("the community pipeline: a verdict after the member left", () => {
  it("records no offence once the member has left", async () => {
    const client = heldClient();
    const h = harness({ client });
    await h.send(groupMessage("check out coolcoin.xyz for gains"));
    await settle();
    await h.send(groupMessage("", { left_chat_member: MEMBER, from: MEMBER }));
    h.clock.now = NOW + 5 * S;
    client.release(verdict({ verdict: "spam", category: "link_spam", question: "none" }));
    await settle();
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n).toBe(0);
  });
});
