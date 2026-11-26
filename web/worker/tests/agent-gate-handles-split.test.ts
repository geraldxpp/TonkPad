import { describe, expect, it } from "vitest";
import { findHandle } from "../src/telegram/agent/gate-handles";
import { gate, LAUNCHPAD, PLACEHOLDER } from "./agent-gate-fixtures";

/**
 * Fix round 2 (answers#11): lowercase support-style usernames beside "DM",
 * "contact" or "Telegram" block the answer, as made-up ones do; and an
 * address split by spaces or underscores is read as one and replaced
 * whole, so no part of it can be copied and joined.
 */

const OFFICIAL = ["TonkfunBot", "tonkfun_launches", "tonkfun_chat"];

describe("lowercase support-style usernames (answers#11)", () => {
  it.each([
    "DM supportdesk on Telegram for help.",
    "Contact cryptohelpdesk on Telegram.",
    "message solanasupport for a refund.",
    "Write to supportteam on Telegram.",
    "DM walletrecovery on Telegram.",
    "Supportdesk on Telegram can help with that.",
  ])("blocks %s", (reply) => {
    expect(findHandle(reply, OFFICIAL)).toBe(true);
    expect(gate(reply).blocked).toBe("handle");
  });

  it.each([
    "The admins are listed in the group's info.",
    "Ask the admins in the official Telegram group.",
    "Contact the team via the contact on the Security page.",
    "Message MetaMask support only through their site.",
    "Open the link in Telegram Desktop or on your phone.",
    "Message your teammates on Telegram, never strangers.",
    "Write to the helpline listed on findahelpline.",
    "The support page explains every fee.",
  ])("lets plain words through: %s", (reply) => {
    expect(findHandle(reply, OFFICIAL, "MetaMask")).toBe(false);
  });
});

describe("addresses split by spaces or underscores (answers#11)", () => {
  it.each([
    "On the contract: the launchpad is 0x22222222222222222222 22222222222222222222 on Robinhood Chain.",
    "On the contract: the launchpad is 0x2222_2222_2222_2222_2222_2222_2222_2222_2222_2222 on Robinhood Chain.",
    "On the contract: the launchpad is 0x 2222222222222222222222222222222222222222 on Robinhood Chain.",
    "On the contract: the mint is 7GCihgDB8fe6KNjn 2MYtkzZcRjQy3t9GHdC8uHYmW2hr on Solana.",
  ])("replaces the whole span: %s", (reply) => {
    const gated = gate(reply);
    expect(gated.blocked).toBeNull();
    expect(gated.text).toMatch(new RegExp(`is \\(an address I can't verify\\) on (?:Robinhood Chain|Solana)\\.$`));
    expect(gated.text).not.toMatch(/2222|7GCih|2MYtk/);
    expect(gated.text).toContain(PLACEHOLDER);
  });

  it("keeps an allowed address written in parts, and joins no ordinary words or figures", () => {
    const parts = `${LAUNCHPAD.slice(0, 22)} ${LAUNCHPAD.slice(22)}`;
    expect(gate(`On the contract: the launchpad is ${parts}.`).text).toBe(`On the contract: the launchpad is ${parts}.`);
    for (const reply of [
      "On networks: Robinhood Chain 46630 and Uniswap v4 pools.",
      "On fees: every trade pays the 1% protocol fee, 25% of it to a referrer.",
      "On hashes: a transaction 0x12 34 is not an address.",
    ]) {
      expect(gate(reply).text).toBe(reply);
    }
  });
});
