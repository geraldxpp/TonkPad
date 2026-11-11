import { describe, expect, it } from "vitest";
import { isInvited, launchInvites, parseInvites } from "@/shared/tonk/invites";

const A = "0x1111111111111111111111111111111111111111";
const B = "0xAbCdEf0123456789aBcDeF0123456789abCDef01";

describe("the guarded launch's invite list", () => {
  it("is off unless set, so Launch stays open to every wallet", () => {
    expect(parseInvites(undefined)).toBeNull();
    expect(parseInvites("  , ;\n")).toBeNull();
    // The test build sets no list.
    expect(launchInvites()).toBeNull();
    expect(isInvited(null, null)).toBe(true);
    expect(isInvited(A, null)).toBe(true);
  });

  it("takes addresses separated by commas, spaces or new lines, in any case", () => {
    const invites = parseInvites(` ${A},\n${B} ; `);
    expect(invites).toEqual(new Set([A, B.toLowerCase()]));
    expect(isInvited(`0x${B.slice(2).toUpperCase()}`, invites)).toBe(true);
    expect(isInvited("0x2222222222222222222222222222222222222222", invites)).toBe(false);
    // No wallet connected: not invited yet.
    expect(isInvited(null, invites)).toBe(false);
  });

  it("invites nobody when every entry is malformed: a typo closes Launch rather than opening it", () => {
    const invites = parseInvites("0x123, alice.eth");
    expect(invites).toEqual(new Set());
    expect(isInvited(A, invites)).toBe(false);
  });
});
