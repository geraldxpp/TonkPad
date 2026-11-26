import { describe, expect, it } from "vitest";
import { COMMUNITY_DICTIONARIES } from "../src/telegram/i18n/community";
import { en } from "../src/telegram/i18n/en";
import { launchesView } from "../src/telegram/lists";
import { ethText, launchPost, lockDate, lockLine, lockPost, milestonePost, pctText, shieldPost } from "../src/telegram/posts";
import { cardView, helpView, homeView, idView, notFoundView, referralView } from "../src/telegram/views";
import { callbacks, SITE, SOL_MINT, token, urls, WALLET, WHOA } from "./telegram-fixtures";

const community = COMMUNITY_DICTIONARIES.en;

describe("token card", () => {
  it("shows who it is, its score and badges, its figures and its address", () => {
    const view = cardView(token(), "en", SITE);
    expect(view.text).toBe(
      [
        "<b>Whoa the Tarsier</b> · WHOA",
        "tonkfun.fun · Robinhood Chain",
        "",
        "Mission score <b>78</b> · Safe",
        "Locked · Crew 2% · Block-0 Shield",
        "",
        "Market cap <b>$21.4K</b>",
        "24h <b>+12.4%</b>",
        "Bonding curve <b>41%</b>",
        "Holders <b>37</b>",
        "",
        `<code>${WHOA}</code>`,
      ].join("\n"),
    );
    expect(urls(view)[0]).toBe(`${SITE}/token/${WHOA}`);
    expect(callbacks(view)).toEqual([`r:en:${WHOA}`]);
    expect(urls(view)[1]).toMatch(/^https:\/\/t\.me\/share\/url\?url=https%3A%2F%2Fwww\.tonkfun\.fun%2Ftoken%2F0xfd42/);
  });

  it("keeps a hostile name inert", () => {
    const view = cardView(token({ name: "<i>@support</i> claim.evil.xyz $FREE /start", ticker: "#WIN" }), "en", SITE);
    const title = view.text.split("\n")[0];
    expect(title).not.toMatch(/<i>|@|\$|#|\/start|claim\.evil/);
    expect(title).toContain("claim·evil·xyz");
  });

  it("says when market data isn't in yet, and when a token has graduated", () => {
    const fresh = cardView(token({ marketCap: 0, holders: null }), "en", SITE).text;
    expect(fresh).toContain("Market data is still coming in.");
    expect(fresh).not.toContain("Holders");
    const done = cardView(token({ curve: 1 }), "en", SITE).text;
    expect(done).toContain("Graduated to its own pool");
    expect(done).toContain("Graduated");
  });

  it("speaks the visitor's language and links to the site in it, except where many read it", () => {
    const view = cardView(token({ level: "Caution" }), "es", SITE);
    expect(urls(view)[0]).toBe(`${SITE}/es/token/${WHOA}`);
    expect(view.text).not.toContain("Caution");
    expect(view.text).toContain("<b>$21.4K</b>");
    const shared = cardView(token(), "es", SITE, { shared: true });
    expect(urls(shared)[0]).toBe(`${SITE}/token/${WHOA}`);
    expect(callbacks(shared)).toEqual([`r:es:${WHOA}`]);
  });

  it("names Solana tokens' launchpad and chain", () => {
    expect(cardView(token({ chain: "sol", launchpad: "pump", address: SOL_MINT, shield: undefined }), "en", SITE).text).toContain("Pump.fun · Solana");
  });

  it("says plainly what it follows, and links a token page only where the site can still read one", () => {
    const view = notFoundView(WHOA, "en", SITE);
    expect(view.text).toContain("I don't follow this token.");
    expect(urls(view)).toEqual([`${SITE}/token/${WHOA}`]);
    expect(urls(notFoundView(SOL_MINT, "en", SITE))).toEqual([`${SITE}/`]);
  });
});

describe("menus", () => {
  it("home offers four actions and the site", () => {
    const view = homeView("en", SITE);
    expect(callbacks(view)).toEqual(["check", "l:tonk", "ref", "help"]);
    expect(urls(view)).toEqual([`${SITE}/`]);
  });

  it("help in a group is short, and in a private chat names the inline mode", () => {
    expect(helpView("en", SITE, { group: true, bot: "tonkfun_bot", ai: false }).text).not.toContain("/referral");
    const full = helpView("en", SITE, { group: false, bot: "tonkfun_bot", ai: false });
    expect(full.text).toContain("@tonkfun_bot");
    expect(full.text).not.toContain(community.help.ai);
    expect(callbacks(full)).toEqual(["home"]);
    expect(urls(full)).toEqual([`${SITE}/docs`, `${SITE}/`]);
  });

  it("home opens with Ask a question while AI answers are on", () => {
    const view = homeView("en", SITE, { ai: true });
    expect(callbacks(view)).toEqual(["askp", "check", "l:tonk", "ref", "help"]);
    expect(view.keyboard?.inline_keyboard[0]).toEqual([{ text: en.home.ask, callback_data: "askp" }]);
    expect(homeView("en", SITE, { ai: false })).toEqual(homeView("en", SITE));
  });

  it("help says how to ask, that answers are AI's and can be wrong, and links the privacy policy, while AI answers are on", () => {
    const full = helpView("de", SITE, { group: false, bot: "tonkfun_bot", ai: true });
    const de = COMMUNITY_DICTIONARIES.de;
    expect(full.text).toContain(`• ${de.help.ask}`);
    expect(full.text).toContain(de.help.ai);
    expect(full.text).not.toContain(de.help.groupAsk);
    expect(urls(full)).toEqual([`${SITE}/de/docs`, `${SITE}/de/privacy/telegram`, `${SITE}/de`]);
    expect(callbacks(full)).toEqual(["home"]);
    const group = helpView("en", SITE, { group: true, bot: "tonkfun_bot", ai: true });
    expect(group.text).toContain(community.help.groupAsk);
    expect(group.text).toContain(community.help.ai);
    expect(group.text).not.toContain(community.help.ask);
    expect(urls(group)).toEqual([`${SITE}/`, `${SITE}/privacy/telegram`]);
    expect(group.keyboard?.inline_keyboard.flat().map((b) => b.text)).toContain(community.help.privacy);
  });

  it("tells a person their own Telegram ID, and nothing else", () => {
    expect(idView("en", 123_456_789)).toEqual({ text: `${community.id.yours} <code>123456789</code>` });
    expect(idView("ja", 42).text).toBe(`${COMMUNITY_DICTIONARIES.ja.id.yours} <code>42</code>`);
    expect(idView("en", Number.NaN).text).toContain("<code>?</code>");
  });

  it("lists the latest launches with a segmented switch and a button per token", () => {
    const view = launchesView([token(), token({ address: SOL_MINT, ticker: "PEPE", name: "Pepe" })], "tonk", "en", SITE);
    expect(view.text.startsWith("<b>Latest on tonkfun.fun</b>")).toBe(true);
    expect(view.text).toContain("1. <b>Whoa the Tarsier</b> · WHOA");
    expect(view.text).toContain("Score 78 · Safe · 5d");
    expect(view.keyboard?.inline_keyboard.slice(0, 2).map((row) => row.map((b) => b.text))).toEqual([["✓ tonkfun.fun", "Pons"], ["Pump.fun", "Trending"]]);
    expect(callbacks(view)).toEqual(["l:tonk", "l:pons", "l:pump", "l:trend", `c:${WHOA}`, `c:${SOL_MINT}`, "home"]);
    expect(urls(launchesView([token({ launchpad: "pons", ageMinutes: 5 })], "pons", "en", SITE))).toEqual([`${SITE}/?pad=pons&tab=new`]);
    expect(urls(view)).toEqual([`${SITE}/`]);
    expect(urls(launchesView([token({ ageMinutes: 30 })], "tonk", "en", SITE))).toEqual([`${SITE}/?pad=tonk&tab=new`]);
    expect(launchesView([token({ ageMinutes: 0.5 })], "tonk", "en", SITE).text).toContain("· 30s");
  });

  it("says so when a list is empty", () => {
    expect(launchesView([], "trend", "en", SITE).text).toContain("Nothing is trending right now.");
  });

  it("makes a referral link with what it pays", () => {
    const view = referralView(WALLET, "en", SITE);
    expect(view.text).toContain(`<code>${SITE}/?ref=${WALLET}</code>`);
    expect(view.text).toContain("25% of the 1% protocol fee");
    expect(urls(view)[1]).toBe(`${SITE}/?ref=${WALLET}`);
  });
});

describe("channel posts", () => {
  const lock = { type: "time" as const, lockedBps: 10_000, start: 0, end: 180 * 86_400, total: "1", claimed: "0", checkpoint: "0" };

  it("describes a launch's lock, Crew Rewards and shield", () => {
    const view = launchPost(token(), { lock, crewBps: 200 }, "en", SITE);
    expect(view.text).toContain("<b>New launch</b>");
    expect(view.text).toContain("100% of the dev buy locked for 180 days");
    expect(view.text).toContain("Crew Rewards 2%");
    expect(view.text).toContain("Block-0 Shield on");
    expect(urls(view)).toEqual([`${SITE}/token/${WHOA}`]);
  });

  it("writes vesting and single days correctly", () => {
    expect(lockLine({ ...lock, type: "linear", lockedBps: 5_000, end: 86_400 }, "en")).toBe("50% of the dev buy vests over 1 day");
    expect(lockLine(null, "en")).toBeNull();
    expect(lockLine({ ...lock, end: 2 ** 62 }, "en")).toBeNull();
    expect(lockPost(token(), 2 ** 62, "en", SITE)).toBeNull();
  });

  it("reports milestones and the shield without naming wallets", () => {
    expect(milestonePost(token(), 50, "en", SITE).text).toContain("<b>50%</b> of its curve is sold.");
    const shield = shieldPost(token(), { buys: 1, eth: 0.12345 }, "en", SITE).text;
    expect(shield).toContain("<b>1 buy</b>");
    expect(shield).toContain("<b>0.1235</b> ETH burned");
    expect(ethText(0.0000297)).toBe("0.00003");
  });

  it("places a share as each language writes it, and dates the 1st as French and Portuguese do", () => {
    expect([pctText(10_000, "en"), pctText(250, "tr"), pctText(5_000, "de"), pctText(5_000, "fr")]).toEqual(["100%", "%2.5", "50\u00a0%", "50\u00a0%"]);
    expect(milestonePost(token(), 50, "tr", SITE).text).toContain("<b>%50</b>");
    const firstOfMay = Date.UTC(2027, 4, 1) / 1000;
    expect(lockDate(firstOfMay, "fr")).toBe("1er mai 2027");
    expect(lockDate(firstOfMay, "pt")).toBe("1º de maio de 2027");
    expect(lockDate(Date.UTC(2027, 4, 19) / 1000, "fr")).toBe("19 mai 2027");
  });
});
