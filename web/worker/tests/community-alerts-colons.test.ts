import { describe, expect, it } from "vitest";
import { testWords } from "./community-fixtures";
import { alertOf, setupAlerts as setup } from "./community-alerts-fixtures";
import { MIN, NOW } from "./fixtures";

/** A colon that ends a phrase, then each form a colon or a handle could make live in Telegram. */
const HOSTILE = "Note: https://x tg://resolve tg:resolve javascript:x t.me/+abc @scammer";
/** HOSTILE as a name, an excerpt or a reporter's reason shows it: every colon gone. */
const CLEANED = "Note httpsx tgresolve tgresolve javascriptx t·me+abc scammer";
/** HOSTILE in a line of the model's sentences (the AI's guess, a proposed answer): only the colon that ends a phrase stays. */
const PHRASED = "Note: httpsx tgresolve tgresolve javascriptx t·me+abc scammer";

const member = (id: number, name = "Sam") => ({ id, name, username: null, since: null });
/** The first line that starts with `label`. */
const lineOf = (html: string, label: string) => html.split("\n").find((line) => line.startsWith(label));

describe("colons in an alert's sentences", () => {
  it("keeps the colons in what the bot did and what it leaves to the admins", async () => {
    const { raise, sends } = setup();
    const { byHand, olderMessages } = testWords.admin;
    await raise(
      alertOf({ member: member(1), done: "Member: a message was removed. Reason: lookalike." }),
      alertOf({ member: member(2), undo: "mute", done: `Member can't post for 24 hours. Reason: risky_file. ${byHand}` }),
      alertOf({ member: member(3), undo: "ban", done: `Member was removed from the group. Reason: phishing. ${olderMessages}` }),
      alertOf({ kind: "secret", category: "secret", member: member(4), excerpt: null, undo: null, routine: false, done: byHand }),
      alertOf({ member: member(5), done: "Plus de 48 heures : supprimez-le dans l’app." }),
    );
    expect(sends().map(({ html }) => lineOf(html, "Done: "))).toEqual([
      "Done: Member: a message was removed. Reason: lookalike.",
      "Done: Member can't post for 24 hours. Reason: risky_file. I can't delete messages over 48 hours old: please delete it in the app.",
      "Done: Member was removed from the group. Reason: phishing. Older messages stay: remove them in the app with Delete all from user.",
      "Done: I can't delete messages over 48 hours old: please delete it in the app.",
      "Done: Plus de 48 heures : supprimez-le dans l’app.",
    ]);
  });

  it("keeps them in a digest's items, and keeps the bot's own long line whole up to 1,000 characters", async () => {
    const { alerts, raise, sends } = setup();
    await raise(
      alertOf({ kind: "observe", done: "Member: a message was removed. Reason: lookalike." }),
      alertOf({ member: member(2), done: `Reason: ${"x".repeat(400)}` }),
      alertOf({ member: member(3), done: `Reason: ${"y".repeat(1_200)}` }),
    );
    await alerts.tick(NOW + 10 * MIN);
    const [whole, cut, digest] = sends().map(({ html }) => lineOf(html, "Done: ") ?? "");
    expect(digest).toBe("Done: Member: a message was removed. Reason: lookalike.");
    expect(whole).toBe(`Done: Reason: ${"x".repeat(400)}`);
    expect(cut).toBe(`Done: Reason: ${"y".repeat(991)}…`);
    expect([...cut.slice("Done: ".length)]).toHaveLength(1_000);
  });

  it("still defangs every link form and mention in names, excerpts, report reasons, the AI's guess and a proposed answer", async () => {
    const { raise, sends } = setup();
    const report = { kind: "report", category: "reported", undo: null, routine: false, done: null } as const;
    await raise(
      alertOf({ member: member(1, HOSTILE), excerpt: HOSTILE, done: "Member: a message was removed.", aiGuess: HOSTILE }),
      alertOf({ ...report, member: member(2), reporter: { id: 301, name: HOSTILE, username: null }, excerpt: HOSTILE, reason: HOSTILE }),
      // An invisible character after a colon is no space: the colon still goes.
      alertOf({ kind: "unsure", category: "unsure", undo: null, routine: false, member: member(3), excerpt: null, done: null, preview: "tg:​resolve javascript:⁠x", aiGuess: "tg:﻿resolve" }),
      alertOf({ kind: "unsure", category: "unsure", undo: null, routine: false, member: member(4), excerpt: null, done: null, preview: HOSTILE }),
    );
    const [action, reported, hidden, preview] = sends().map(({ html }) => html.split("\n"));
    expect(action.slice(1, 5)).toEqual([`Member: ${CLEANED} · <code>1</code>`, `Message: ${CLEANED}`, "Done: Member: a message was removed.", `<i>AI's guess: ${PHRASED}</i>`]);
    expect(reported.slice(1, 5)).toEqual(["Member: Sam · <code>2</code>", `Reported by: ${CLEANED} · <code>301</code>`, `Message: ${CLEANED}`, `Reason given: ${CLEANED}`]);
    expect(hidden.slice(2, 4)).toEqual(["Proposed answer: tgresolve javascriptx", "<i>AI's guess: tgresolve</i>"]);
    expect(lineOf(preview.join("\n"), "Proposed answer: ")).toBe(`Proposed answer: ${PHRASED}`);
    for (const { html } of sends()) {
      const text = html.replace(/<[^>]*>/g, "");
      expect(text).not.toMatch(/https:|tg:|javascript:|\/|t\.me|@/);
      // A colon is left only where a phrase ends: never where a link's address would start.
      expect(text).not.toMatch(/:(?! |$)/m);
    }
  });

  it("keeps the bot's own commands as written in what it did, and in the model's lines only the commands its words name", async () => {
    const { raise, sends } = setup();
    await raise(
      alertOf({ member: member(1), done: "AI is off: check the key, then send /ai on. See /status too." }),
      alertOf({ member: member(2), done: "今日の AI 支出は 3.00 USD。上限を引き上げてから、/ai on を送ってください。" }),
      alertOf({ member: member(3), done: null, aiGuess: "send /mod, then /ai off" }),
      alertOf({ member: member(4), done: null, aiGuess: "https://x/ai tg://ai /aiX /ai/x" }),
    );
    const lines = sends().map(({ html }) => html.split("\n"));
    expect(lineOf(lines[0].join("\n"), "Done: ")).toBe("Done: AI is off: check the key, then send /ai on. See /status too.");
    expect(lineOf(lines[1].join("\n"), "Done: ")).toBe("Done: 今日の AI 支出は 3.00 USD。上限を引き上げてから、/ai on を送ってください。");
    expect(lines[2].find((line) => line.includes("AI's guess"))).toBe("<i>AI's guess: send /mod, then /ai off</i>");
    expect(lines[3].find((line) => line.includes("AI's guess"))).toBe("<i>AI's guess: httpsxai tgai aiX aix</i>");
  });
});
