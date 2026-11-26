// @vitest-environment node
import { describe, expect, it } from "vitest";
import { groupMessage } from "./community-fixtures";
import { byText, edit, scamHandled, TEXT_SCAM } from "./community-pipeline-checks-fixtures";
import { NOW } from "./fixtures";
import { harness, S, settle } from "./community-pipeline-fixtures";

/**
 * Fix round 2 (answers#1): a check past its pace waits for its turn
 * instead of being dropped. An edit within a minute of its message's check
 * is checked once that minute ends, as its latest version, unless the
 * message was removed meanwhile (a member past their 3 checks a minute:
 * community-pipeline-checks-turn.test.ts).
 */

describe("an edit within its message's minute (answers#1)", () => {
  it("is checked once the minute ends, and the scam it became is removed, muted and alerted", async () => {
    const h = harness({ client: byText().client });
    const m = groupMessage("how do the fees work on a launch?");
    await h.send(m);
    await settle();
    h.clock.now = NOW + 20 * S;
    await h.community.pipeline.onEdited(edit(m, TEXT_SCAM, NOW + 20 * S));
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.removed()).toEqual([]);
    await h.tick(NOW + 55 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    await h.tick(NOW + 60 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage"]);
    scamHandled(h, m);
  });

  it("checks only the latest version once, and nothing when the message went back to what was checked", async () => {
    const c = byText();
    const h = harness({ client: c.client });
    const m = groupMessage("how do the fees work on a launch?");
    await h.send(m);
    await settle();
    await h.community.pipeline.onEdited(edit(m, "how do the fees work on a launch? any docs?", NOW + 10 * S));
    await h.community.pipeline.onEdited(edit(m, TEXT_SCAM, NOW + 20 * S));
    await settle();
    await h.tick(NOW + 65 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage"]);
    const second = JSON.stringify(c.calls[1].params);
    expect(second).toContain("0.3 ETH back");
    expect(second).not.toContain("any docs");
    scamHandled(h, m);

    const back = harness({ client: byText().client });
    const q = groupMessage("how do the fees work on a launch?");
    await back.send(q);
    await settle();
    await back.community.pipeline.onEdited(edit(q, TEXT_SCAM, NOW + 10 * S));
    await back.community.pipeline.onEdited(edit(q, "how do the fees work on a launch?", NOW + 20 * S));
    await settle();
    await back.tick(NOW + 65 * S);
    await settle();
    expect(back.kinds()).toEqual(["triage"]);
    expect(back.removed()).toEqual([]);
  });

  it("drops the waiting check when the message is removed", async () => {
    const h = harness({ client: byText().client });
    const m = groupMessage("how do the fees work on a launch?");
    await h.send(m);
    await settle();
    await h.community.pipeline.onEdited(edit(m, TEXT_SCAM, NOW + 10 * S));
    // A later edit the rules remove on their own (a look-alike link): the message is gone, nothing is left to check.
    await h.community.pipeline.onEdited(edit(m, "Claim your airdrop at tonkfun-airdrop.xyz", NOW + 20 * S));
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    await h.tick(NOW + 65 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
  });
});
