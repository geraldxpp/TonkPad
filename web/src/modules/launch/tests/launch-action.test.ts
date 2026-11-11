import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { actionState } from "../components/LaunchAction";

const READY = { hasVisibleErrors: false, owner: "0x1111111111111111111111111111111111111111", invited: true, balance: BigInt(10) ** BigInt(18), payNow: BigInt(1), offline: false, paused: false, unit: "ETH" };

describe("the studio's main button", () => {
  it("asks for a wallet first, then says Launch is invite-only for a wallet off the list, before anything else", () => {
    expect(actionState(en, { ...READY, owner: null, invited: false })).toEqual({ kind: "connect", label: en.header.connectWallet, disabled: false });
    expect(actionState(en, { ...READY, invited: false })).toEqual({ kind: "invite", label: "Invite-only for now", disabled: true });
    // Paused and short of funds still say so to an invited wallet.
    expect(actionState(en, { ...READY, paused: true }).kind).toBe("paused");
    expect(actionState(en, READY)).toEqual({ kind: "review", label: en.launch.action.review, disabled: false });
  });
});
