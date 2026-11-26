import { describe, expect, it } from "vitest";
import { messageLink } from "../src/telegram/community/alerts";
import { ADMIN_CHAT_ID, GROUP_ID } from "./community-fixtures";
import { alertOf, buttons, LINK, setupAlerts as setup } from "./community-alerts-fixtures";
import { HOUR, NOW } from "./fixtures";

describe("alert text", () => {
  it("escapes HTML and cleans what members and the model wrote", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ member: { id: 101, name: "<b>Sam</b> & Co", username: "sam", since: null }, excerpt: "<script>x</script>", aiGuess: "<i>sure</i>" }));
    const [{ html, chat, options }] = sends();
    expect(chat).toBe(ADMIN_CHAT_ID);
    expect(options.kind).toBe("alert");
    expect(html).toContain("&lt;b&gt;Sam&lt;b&gt; &amp; Co");
    expect(html).not.toMatch(/<script|<b>Sam|<i>sure/);
  });

  it("carries no live link: no URL, @mention, #tag, $tag or command outside the Open message button", async () => {
    const { raise, sends } = setup();
    await raise(
      alertOf({
        member: { id: 101, name: "Support @help t.me/x", username: "scam_bot", since: null },
        excerpt: "claim at https://evil.example/airdrop or t.me/+AbCdEf, DM @support_tonk #win $TONK /start a@b.co",
        aiGuess: "see evil.example and @x",
      }),
    );
    const [{ html, options }] = sends();
    expect(html).not.toMatch(/:\/\/|t\.me|@|evil\.example|#win|\$TONK|\/start|<a /);
    expect(html).toContain("tonkfun·fun community");
    expect(buttons(options.keyboard).flat().filter((b) => b.startsWith("url:"))).toEqual([`url:${LINK}`]);
  });

  it("shows the username as code without @, the ID as code and a newcomer's time in the group", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ member: { id: 101, name: "Sam", username: "sam", since: NOW - 3 * HOUR } }));
    expect(sends()[0].html).toContain("New here: Sam · <code>sam</code> · <code>101</code> · 3 hours");
    expect(sends()[0].html).not.toContain("@sam");
  });

  it("labels the AI's guess, in italics, after everything else but the never-DM reminder", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ aiGuess: "Looks like promotion" }));
    const lines = sends()[0].html.split("\n");
    expect(lines.slice(-3)).toEqual(["<i>AI's guess: Looks like promotion</i>", "", "Reply in the group. Never DM first."]);
    expect(lines[0]).toBe("<b>Alert: action</b> · Case: unknown_link · tonkfun·fun community");
  });

  it("never shows an excerpt for a secret or a flaw report", async () => {
    const { raise, sends } = setup();
    await raise(
      alertOf({ category: "secret", member: { id: 1, name: "A", username: null, since: null } }),
      alertOf({ kind: "secret", category: null, member: { id: 2, name: "B", username: null, since: null } }),
      alertOf({ category: "security_report", member: { id: 3, name: "C", username: null, since: null } }),
      alertOf({ kind: "security", category: "bug", member: { id: 4, name: "D", username: null, since: null }, routine: false }),
      alertOf({ kind: "lost_funds", category: "security", member: { id: 5, name: "E", username: null, since: null }, routine: false }),
    );
    expect(sends()).toHaveLength(5);
    for (const { html } of sends()) expect(html).not.toContain("check my site");
  });

  it("draws who sent a report on its own line after the member, cleaned like the member", async () => {
    const { raise, sends } = setup();
    const report = { kind: "report", category: "reported", undo: null, routine: false, done: "spam link" } as const;
    await raise(
      alertOf({ ...report, reporter: { id: 301, name: "Rae Porter", username: "rae_p" } }),
      alertOf({ ...report, member: { id: 102, name: "Kim", username: null, since: null }, reporter: { id: 302, name: "Ed @support t.me/x", username: "ed.x" } }),
    );
    const [plain, hostile] = sends().map(({ html }) => html.split("\n"));
    expect(plain.slice(0, 5)).toEqual([
      "<b>Alert: report</b> · Case: reported · tonkfun·fun community",
      "Member: Sam · <code>sam</code> · <code>101</code>",
      "Reported by: Rae Porter · <code>rae_p</code> · <code>301</code>",
      "Message: check my site",
      "Done: spam link",
    ]);
    expect(hostile[2]).toBe("Reported by: Ed support t·mex · <code>ed·x</code> · <code>302</code>");
    expect(sends()[1].html).not.toMatch(/@|t\.me/);
  });

  it("draws a review's current restriction in the bot's words, and nothing when Telegram couldn't say", async () => {
    const { raise, sends } = setup();
    const review = { kind: "appeal", category: "flood", undo: "mute", routine: false, excerpt: null, link: null, done: null } as const;
    const member = (id: number, name: string) => ({ id, name, username: null, since: null });
    await raise(
      alertOf({ ...review, standing: "muted" }),
      alertOf({ ...review, member: member(102, "Kim"), undo: "warn", standing: "none" }),
      alertOf({ ...review, member: member(103, "Lee"), undo: "ban", standing: "removed" }),
      alertOf({ ...review, member: member(104, "Max"), undo: null, standing: null }),
    );
    const [muted, none, removed, unknown] = sends().map(({ html }) => html.split("\n"));
    expect(muted).toEqual(["<b>Alert: appeal</b> · Case: flood · tonkfun·fun community", "Member: Sam · <code>sam</code> · <code>101</code>", "Muted", "", "Reply in the group. Never DM first."]);
    expect([none[2], removed[2]]).toEqual(["Not restricted", "Banned"]);
    expect(unknown).toEqual(["<b>Alert: appeal</b> · Case: flood · tonkfun·fun community", "Member: Max · <code>104</code>", "", "Reply in the group. Never DM first."]);
  });

  it("keeps the reporter and the standing in a storm's summary", async () => {
    const { alerts, raise, sends } = setup();
    await raise(...[1, 2, 3, 4, 5, 6].map((id) => alertOf({ member: { id, name: `Member ${id}`, username: null, since: null } })));
    // A review with an Undo keeps its own message in a storm (community-alerts-storm.test.ts): this one offers none.
    await raise(
      alertOf({ kind: "report", category: "reported", undo: null, routine: false, member: { id: 7, name: "Spam", username: null, since: null }, reporter: { id: 301, name: "Rae", username: "rae_p" } }),
      alertOf({ kind: "appeal", category: "flood", undo: null, routine: false, member: { id: 8, name: "Kim", username: null, since: null }, standing: "muted" }),
    );
    await alerts.tick(NOW + 60_000);
    const summary = sends().at(-1)?.html.split("\n") ?? [];
    expect(summary).toContain("Reported by: Rae · <code>rae_p</code> · <code>301</code>");
    expect(summary).toContain("Muted");
  });

  it("marks a member at risk first", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ kind: "crisis", category: "crisis", urgent: true, routine: false, undo: null }), alertOf({ kind: "distress", category: "distress", urgent: true, routine: false, undo: null, member: null }));
    const [crisis, distress] = sends().map(({ html }) => html.split("\n"));
    expect(crisis[0]).toBe("<u><b>Alert: crisis</b></u> · Case: crisis · tonkfun·fun community");
    expect(distress.slice(0, 2)).toEqual(["<u><b>Alert: crisis</b></u>", "<b>Alert: distress</b> · Case: distress · tonkfun·fun community"]);
  });
});

describe("alert buttons", () => {
  it("offers each case its actions, as x:<action>:<chat>:<user or message>", async () => {
    const { raise, sends } = setup();
    const member = (id: number) => ({ id, name: "M", username: null, since: null });
    await raise(
      alertOf({ undo: "warn", member: member(1) }),
      alertOf({ undo: "mute", member: member(2) }),
      alertOf({ undo: "ban", member: member(3) }),
      alertOf({ kind: "report", category: "reported", undo: null, member: member(4), routine: false }),
      alertOf({ kind: "raid", category: "link_raid", undo: null, member: null, link: null }),
      alertOf({ kind: "lost_funds", category: "lost_funds", undo: null, member: member(5), routine: false }),
    );
    const [warn, mute, ban, report, raid, lost] = sends().map(({ options }) => buttons(options.keyboard));
    const g = GROUP_ID;
    expect(warn).toEqual([[`url:${LINK}`], [`Undo=x:u:${g}:1`, `Ban=x:b:${g}:1`], [`Trust this member=x:t:${g}:1`], [`Handled=x:h:${g}:0`]]);
    expect(mute).toEqual([[`url:${LINK}`], [`Unmute=x:m:${g}:2`, `Ban=x:b:${g}:2`], [`Trust this member=x:t:${g}:2`], [`Handled=x:h:${g}:0`]]);
    expect(ban).toEqual([[`url:${LINK}`], [`Unban=x:b0:${g}:3`, `Trust this member=x:t:${g}:3`], [`Handled=x:h:${g}:0`]]);
    expect(report).toEqual([[`url:${LINK}`], [`Delete=x:d:${g}:42`, `Mute 1 h=x:q:${g}:4`], [`Handled=x:h:${g}:0`]]);
    expect(raid).toEqual([[`End raid mode=x:r:${g}:0`], [`Handled=x:h:${g}:0`]]);
    expect(lost).toEqual([[`url:${LINK}`], [`Handled=x:h:${g}:0`]]);
  });

  it("gives a routine alert without actions no buttons, and one about no group Handled for any group's admins", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ kind: "budget", chat: null, category: null, member: null, undo: null, link: null }), alertOf({ kind: "lost_funds", chat: null, category: "lost_funds", member: { id: null, name: "Sam", username: "sam", since: null }, undo: null, link: null, routine: false }));
    expect(sends()[0].options.keyboard).toBeUndefined();
    expect(buttons(sends()[1].options.keyboard)).toEqual([["Handled=x:h:0:0"]]);
  });

  it("drops a link that isn't a Telegram message link", async () => {
    const { raise, sends } = setup();
    await raise(alertOf({ link: "https://evil.example/c/1/2" }), alertOf({ link: "tg://user?id=1", member: { id: 9, name: "N", username: null, since: null } }));
    for (const { options } of sends()) expect(buttons(options.keyboard).flat().some((b) => b.startsWith("url:"))).toBe(false);
  });

  it("keeps every button's data within 64 bytes with the largest IDs", async () => {
    const { raise, sends } = setup();
    const chat = -1009999999999999;
    const member = { id: Number.MAX_SAFE_INTEGER, name: "M", username: null, since: null };
    await raise(...(["action", "report", "raid", "appeal"] as const).map((kind) => alertOf({ chat, kind, member, messageId: 2_147_483_647, undo: "mute", routine: false })));
    const data = sends().flatMap(({ options }) => (options.keyboard?.inline_keyboard ?? []).flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : [])));
    expect(data).toHaveLength(12);
    for (const d of data) {
      expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
      expect(d).toMatch(/^x:(u|m|b0|b|t|d|q|r|h):-1009999999999999:(9007199254740991|2147483647|0)$/);
    }
  });
});

describe("messageLink", () => {
  it("links a public group's message by its username, in a topic too", () => {
    expect(messageLink({ id: GROUP_ID, username: "tonkfun" }, 42)).toBe("https://t.me/tonkfun/42");
    expect(messageLink({ id: GROUP_ID, username: "tonkfun" }, 42, 7)).toBe("https://t.me/tonkfun/7/42");
  });

  it("links a private supergroup's message by its own ID (minus -1e12), in a topic too", () => {
    expect(messageLink({ id: -1001234567890 }, 42)).toBe("https://t.me/c/1234567890/42");
    expect(messageLink({ id: -1001234567890 }, 42, 7)).toBe("https://t.me/c/1234567890/7/42");
    expect(messageLink({ id: -1000000000001 }, 5)).toBe("https://t.me/c/1/5");
    // Telegram's rule is arithmetic: a supergroup's Bot API ID is -(1e12 + its own ID).
    expect(messageLink({ id: -(1_000_000_000_000 + 9_999_999_999_999) }, 1)).toBe("https://t.me/c/9999999999999/1");
    expect(messageLink({ id: -1001234567890, username: "not.a.name" }, 42)).toBe("https://t.me/c/1234567890/42");
  });

  it("has no link for a basic group, a private chat or a bad message ID", () => {
    expect(messageLink({ id: -123456 }, 42)).toBeNull();
    expect(messageLink({ id: 101 }, 42)).toBeNull();
    expect(messageLink({ id: -1000000000000 }, 42)).toBeNull();
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(messageLink({ id: GROUP_ID }, bad)).toBeNull();
    expect(messageLink({ id: GROUP_ID }, 42, 0)).toBe("https://t.me/c/1234567890/42");
  });
});
