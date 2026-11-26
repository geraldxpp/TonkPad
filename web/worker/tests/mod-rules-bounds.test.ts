// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkMessage } from "../src/telegram/mod/rules";
import { input } from "./mod-rules-fixtures";

/** The fastest of a few runs, after one to warm up: a single slow run is the machine, not the rules. */
function fastest(run: () => void, times = 3): number {
  run();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

const fill = (unit: string) => unit.repeat(Math.ceil(4_096 / unit.length)).slice(0, 4_096);

describe("the rules stay fast on a crafted 4,096-character message", () => {
  it.each([
    ["solicitations", fill("dm me ")],
    ["negated solicitations", fill("please don't ever dm me ")],
    ["handles to contact", fill("contact @abcd_efgh ")],
    ["quoted solicitations", fill("he said 'dm me for support' ")],
    ["solicitations in one long sentence of support words", `dm me ${fill("support help admin team ")}`.slice(0, 4_096)],
    ["legitimacy questions", fill("is a.b the real one ")],
    ["e-mail-like runs", fill("a.b.c.d@e.f.g.h ")],
    ["no spaces at all", fill("dmme")],
    ["bait beside links, sentence after sentence", fill("connect your wallet at evil.xyz. ")],
    ["legitimacy questions about handles", fill("is @abcd_efgh real? ")],
    ["requests addressed to the team", fill("admins, please dm me, my funds are gone ")],
    ["negated bait in one long sentence", fill("don't connect your wallet, ")],
    ["contact addresses for help", fill("contact a@tonkfun-help.io for help ")],
    ["team words without end", `dm me ${fill("someone admins please ")}`.slice(0, 4_096)],
  ])("%s", (_, text) => {
    expect(text.length).toBe(4_096);
    for (const standing of ["new", "member"] as const) expect(fastest(() => checkMessage(input(text, { standing })))).toBeLessThan(50);
  });
});
