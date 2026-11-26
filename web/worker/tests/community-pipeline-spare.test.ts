// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DecideContext, decide } from "../src/telegram/mod/actions";
import { callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, person, scripted, settle, verdict } from "./community-pipeline-fixtures";

// Every decision still runs the real decide(), watched for the context the pipeline gives it.
vi.mock("../src/telegram/mod/actions", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/telegram/mod/actions")>();
  return { ...real, decide: vi.fn(real.decide) };
});

const RISK = "i want to die lol";
const DRAINER = "Claim your airdrop at tonkfun-airdrop.xyz";
const nowS = Math.floor(NOW / 1000);
/** The contexts of the decisions made since the last clear. */
const contexts = (): DecideContext[] => vi.mocked(decide).mock.calls.map((c) => c[2]);
const newcomer = (h: ReturnType<typeof harness>, id = MEMBER.id) => h.records.markNewcomer(GROUP_ID, id, NOW - 60_000, NOW + DAY);

// A block, not an arrow's value: a function returned from beforeEach would run as its teardown.
beforeEach(() => {
  vi.mocked(decide).mockClear();
});

/** prompts/15 (Moderation): someone who writes a strong self-harm phrase is never punished, on every path a decision takes. */
describe("the community pipeline: every decision on a message with a strong self-harm phrase spares its author", () => {
  it("a new message's: the drainer link is deleted, its new member not banned", async () => {
    const h = harness({ client: null });
    newcomer(h);
    const m = groupMessage(`${DRAINER} ${RISK}`);
    await h.send(m);
    await settle();
    expect(contexts()).toEqual([expect.objectContaining({ stale: false, spare: true })]);
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
  });

  it("an edit's, while the same edit without the phrase bans", async () => {
    const h = harness({ client: null });
    newcomer(h);
    const m = groupMessage("hello everyone");
    await h.send(m);
    vi.mocked(decide).mockClear();
    await h.community.pipeline.onEdited({ ...m, text: `${DRAINER} ${RISK}`, edit_date: nowS + 30 });
    await settle();
    expect(contexts()).toEqual([expect.objectContaining({ stale: false, spare: true })]);
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);

    const control = harness({ client: null });
    newcomer(control);
    const n = groupMessage("hello everyone");
    await control.send(n);
    vi.mocked(decide).mockClear();
    await control.community.pipeline.onEdited({ ...n, text: DRAINER, edit_date: nowS + 30 });
    await settle();
    expect(contexts()).toEqual([expect.objectContaining({ spare: false })]);
    expect(callsOf(control.out.log, "ban")).toEqual([[GROUP_ID, MEMBER.id]]);
  });

  it("a message that came while the worker was down, and an edit made then", async () => {
    const h = harness({ client: null });
    newcomer(h);
    const late = groupMessage(`${DRAINER} ${RISK}`, { date: nowS - 900 });
    await h.send(late, true);
    const edited = groupMessage("hello everyone", { date: nowS - 900 });
    await h.community.pipeline.onEdited({ ...edited, text: `${DRAINER} ${RISK}`, edit_date: nowS - 600 });
    await settle();
    expect(contexts()).toEqual([expect.objectContaining({ stale: true, spare: true }), expect.objectContaining({ stale: true, spare: true })]);
    expect(h.removed()).toEqual([late.message_id, edited.message_id]);
    expect(h.out.log.filter((c) => ["restrict", "ban", "kick"].includes(c.op))).toEqual([]);
  });

  it("Haiku's verdict on it, as well as the rules' decision before it", async () => {
    const h = harness({ client: scripted({ triage: verdict({ verdict: "spam", category: "link_spam", question: "none" }) }) });
    const m = groupMessage(`check out coolcoin.xyz for gains ${RISK}`);
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(vi.mocked(decide).mock.calls.map((c) => [c[1] !== null, c[2].spare])).toEqual([[false, true], [true, true]]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
  });

  it("a raid's copies by accounts at risk: every decision on them spares their authors", async () => {
    // A raid of a plain unknown link bans nobody (fix round 2): each copy gets its own rule's decision, and raid mode starts.
    const plain = harness({ client: null });
    for (const id of [301, 302, 303]) newcomer(plain, id);
    for (const id of [301, 302, 303]) await plain.send(groupMessage(`coolcoin.xyz/pump ${RISK}`, { from: person(id) }));
    await settle();
    expect(plain.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
    expect(contexts()).toHaveLength(3);
    expect(contexts().every((c) => c.spare === true)).toBe(true);
    expect(callsOf(plain.out.log, "ban")).toEqual([]);
    // A raid of a non-official invite, which bans new raiders: still nobody at risk is banned.
    vi.mocked(decide).mockClear();
    const invite = harness({ client: null });
    for (const id of [304, 305, 306]) newcomer(invite, id);
    for (const id of [304, 305, 306]) await invite.send(groupMessage(`t.me/+AbCdEfGh12345 ${RISK}`, { from: person(id) }));
    await settle();
    expect(contexts().length).toBeGreaterThanOrEqual(3);
    expect(contexts().every((c) => c.spare === true)).toBe(true);
    expect(callsOf(invite.out.log, "ban")).toEqual([]);
  });
});
