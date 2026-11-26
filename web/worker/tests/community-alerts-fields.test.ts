import { describe, expect, it } from "vitest";
import { createAlerts } from "../src/telegram/community/alerts";
import { ADMIN_CHAT_ID, callsOf, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { alertOf, setupAlerts as setup, settle } from "./community-alerts-fixtures";
import { MIN, NOW } from "./fixtures";

/** The first line that starts with `label`. */
const lineOf = (html: string, label: string) => html.split("\n").find((line) => line.startsWith(label));
const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
const report = { kind: "report", category: "reported", undo: null, routine: false, done: null } as const;

describe("a reporter's reason", () => {
  it("has its own label, cleaned like an excerpt, and never fills the bot's Done line", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ ...report, reason: "already banned by the bot: see t.me/+AbC or @mod" }));
    const html = sends()[0].html;
    expect(lineOf(html, "Reason given: ")).toBe("Reason given: already banned by the bot see t·me+AbC or mod");
    expect(lineOf(html, "Done: ")).toBeUndefined();
  });

  it("is cut at 300 characters, and shown in a storm's summary like the excerpt of a case that needs a person", async () => {
    const { alerts, raise, sends } = setup();
    await raise(...[1, 2, 3, 4, 5, 6].map((id) => alertOf({ member: member(id) })), alertOf({ ...report, member: member(7), reason: `fake ${"x".repeat(400)}` }));
    await alerts.tick(NOW + MIN);
    const reason = lineOf(sends().at(-1)?.html ?? "", "Reason given: ") ?? "";
    expect([...reason.slice("Reason given: ".length)]).toHaveLength(300);
    expect(reason.endsWith("…")).toBe(true);
  });
});

describe("what the bot did", () => {
  it("is the bot's own words, escaped and nothing else: amounts, full stops and commands stay as written", async () => {
    const { raise, sends } = setup();
    await raise(
      alertOf({ member: member(1), done: "AI spending today is at 2.40 USD of 3.00 USD. Private answers are paused." }),
      alertOf({ member: member(2), done: "今日の AI 支出は 3.00 USD。上限を引き上げてから、/ai on を送ってください。" }),
      alertOf({ member: member(3), done: "Member <b> & co: a message was removed." }),
    );
    expect(sends().map(({ html }) => lineOf(html, "Done: "))).toEqual([
      "Done: AI spending today is at 2.40 USD of 3.00 USD. Private answers are paused.",
      "Done: 今日の AI 支出は 3.00 USD。上限を引き上げてから、/ai on を送ってください。",
      "Done: Member &lt;b&gt; &amp; co: a message was removed.",
    ]);
  });

  it("keeps a long line of its own words whole", async () => {
    const { raise, sends } = setup();
    const long = `Member can't post for 24 hours. ${"Older messages stay. ".repeat(20).trim()}`;
    await raise(alertOf({ done: long }));
    expect(lineOf(sends()[0].html, "Done: ")).toBe(`Done: ${long}`);
  });
});

describe("an answer the bot would have given", () => {
  it("has its own label, and is cleaned like the AI's guess, colons that end a phrase kept", async () => {
    const { alerts, raise, sends } = setup();
    await raise(alertOf({ kind: "preview", category: null, member: null, excerpt: "the question", done: null, undo: null, preview: "On fees: the swap fee is 1%. See tonkfun.fun/docs or @x" }));
    await alerts.tick(NOW + 10 * MIN);
    const html = sends()[0].html;
    expect(lineOf(html, "Proposed answer: ")).toBe("Proposed answer: On fees: the swap fee is 1%. See tonkfun·fundocs or x");
    expect(html).not.toContain("the question");
    expect(lineOf(html, "Done: ")).toBeUndefined();
  });

  it("is never drawn as what the bot did, even from a producer that put the model's answer in done", async () => {
    const { alerts, raise, sends } = setup();
    await raise(alertOf({ kind: "preview", category: null, member: null, excerpt: null, undo: null, done: "Fees: see tonkfun.fun/docs or @x" }));
    await alerts.tick(NOW + 10 * MIN);
    const html = sends()[0].html;
    expect(lineOf(html, "Proposed answer: ")).toBe("Proposed answer: Fees: see tonkfun·fundocs or x");
    expect(lineOf(html, "Done: ")).toBeUndefined();
  });

  it("shows on an alert sent at once too", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ kind: "unsure", category: "unsure", routine: false, undo: null, preview: "I can't say: ask the team." }));
    expect(lineOf(sends()[0].html, "Proposed answer: ")).toBe("Proposed answer: I can't say: ask the team.");
  });
});

describe("a digest that can't fit every item", () => {
  it("ends with the admins' own 'and N more', not the newcomer check's count of people", async () => {
    const words = { ...testWords, check: { ...testWords.check, others: "and {count} other people" }, admin: { ...testWords.admin, more: "and {count} more alerts" } };
    const out = recordOut();
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words, now: () => NOW, groupTitle: () => "Group" });
    for (let id = 1; id <= 60; id += 1) alerts.alert(alertOf({ kind: "observe", member: member(id), done: "Member: a message was removed. Reason: lookalike." }));
    await alerts.tick(NOW + 10 * MIN);
    await settle();
    const html = callsOf(out.log, "send")[0]?.[1] as string;
    const parts = html.split("\n\n");
    expect(parts.at(-2)).toMatch(/^and \d+ more alerts$/);
    expect(html).not.toContain("other people");
  });
});
