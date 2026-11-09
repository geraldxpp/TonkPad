import { describe, expect, it } from "vitest";
import { de } from "@/shared/i18n/dictionaries/de";
import { en } from "@/shared/i18n/dictionaries/en";
import { GHOSTY } from "../data/ghosty.mock";
import { type AgentFacts, openingMessages, type Part, reply, routeQuestion } from "../lib/agent";

const a = en.token.agent;
const FACTS: AgentFacts = {
  name: "Ghosty",
  curvePct: 84,
  holders: 1_204,
  priceUsd: 0.0000582,
  devLock: GHOSTY.devLock,
  crew: GHOSTY.crew,
  lockStarted: "Oct 18",
};

const chips = (parts: Part[]) => parts.filter((p) => p.kind === "chip").map((p) => p.text);
const words = (parts: Part[]) => parts.filter((p) => p.kind === "text").map((p) => p.text).join(" ");

describe("routeQuestion", () => {
  it("routes by keyword in the export's order: lock, crew, brief, else other", () => {
    expect(routeQuestion("Is the dev wallet locked?", a)).toBe("lock");
    expect(routeQuestion("When is the next UNLOCK?", a)).toBe("lock");
    expect(routeQuestion("How much has the crew earned?", a)).toBe("crew");
    expect(routeQuestion("what are the fees", a)).toBe("crew");
    expect(routeQuestion("Give me the mission brief.", a)).toBe("brief");
    expect(routeQuestion("status?", a)).toBe("brief");
    expect(routeQuestion("wen moon", a)).toBe("other");
    // "dev" wins over "fee" because lock comes first.
    expect(routeQuestion("dev fees", a)).toBe("lock");
  });

  it("understands the page's language as well as English", () => {
    const d = de.token.agent;
    expect(routeQuestion("Wie viel hat die Crew verdient?", d)).toBe("crew");
    expect(routeQuestion("Ist das gesperrt?", d)).toBe("lock");
    expect(routeQuestion("Gib mir eine Zusammenfassung", d)).toBe("brief");
  });
});

describe("replies", () => {
  it("open with the export's conversation", () => {
    const [welcome, question, answer] = openingMessages(FACTS, a);
    expect(words(welcome.parts)).toBe("Mission control online. Ghosty is 84% up the bonding curve and the crew gets paid on every trade.");
    expect(chips(welcome.parts)).toEqual(["Curve: 84%", "Crew paid: $14.3K", "Holders: 1,204"]);
    expect(question).toMatchObject({ from: "user", parts: [{ kind: "text", text: "Is the dev wallet locked?" }] });
    expect(words(answer.parts)).toBe("Affirmative. 80% of the dev allocation sits in a 180-day linear vest. Nothing has unlocked early.");
    expect(chips(answer.parts)).toEqual(["Dev lock: 80% locked (162d left)", "Lock contract: 0x91c4…b7e2"]);
  });

  it("answer each topic from the token's data", () => {
    expect(chips(reply("lock", FACTS, a))).toEqual(["Dev lock: 80% locked (162d left)", "Next unlock: 12d"]);
    expect(words(reply("lock", FACTS, a))).toContain("started Oct 18");
    expect(words(reply("crew", FACTS, a))).toBe("The crew has pocketed $14,280 so far. 2% of every trade goes straight to holder wallets, no claiming.");
    expect(chips(reply("crew", FACTS, a))).toEqual(["Crew paid: $14.3K", "Fee share: 2%", "Last payout: 4s ago"]);
    expect(chips(reply("brief", FACTS, a))).toEqual(["Price: $0.0000582", "Holders: 1,204", "Curve: 84%", "Dev lock: 80%"]);
    expect(chips(reply("other", FACTS, a))).toEqual(["Holders: 1,204"]);
  });

  it("say so when there's no lock or no crew, and skip the curve once graduated", () => {
    const bare: AgentFacts = { ...FACTS, devLock: null, crew: null, curvePct: null };
    expect(words(reply("lock", bare, a))).toBe(a.noLock);
    expect(words(reply("crew", bare, a))).toBe(a.noCrew);
    expect(chips(reply("brief", bare, a))).toEqual(["Price: $0.0000582", "Holders: 1,204"]);
    expect(words(openingMessages(bare, a)[0].parts)).toBe("Mission control online. Ghosty has graduated from its bonding curve.");
  });

  it("only mentions unfinished curve and crew goals when the token has both", () => {
    expect(words(reply("brief", FACTS, a))).toBe(a.brief);
    for (const facts of [
      { ...FACTS, crew: null },
      { ...FACTS, curvePct: null },
      { ...FACTS, crew: null, curvePct: null },
    ]) {
      expect(words(reply("brief", facts, a))).toBe("Mission brief: current status:");
    }
  });
});
