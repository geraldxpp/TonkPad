import { describe, expect, it } from "vitest";
import { gate, LAUNCHPAD, LOOKALIKE, PLACEHOLDER } from "./agent-gate-fixtures";
import { SOL_MINT } from "./telegram-fixtures";

/**
 * What the moderation rules delete in members' messages can't come back in
 * an answer (injection#8, injection#9, K10): domains with hidden dots,
 * "name dot tld", Telegram-username-shaped handles, and addresses glued to
 * other letters. The bridge's name LI.FI stays, never as a live link.
 */
describe("the answer gate: hidden domains", () => {
  it.each([
    "On claims: the claim page is tonkfun-airdrop[.]xyz, open it.",
    "On claims: the claim page is tonkfun-airdrop(.)xyz today.",
    "On claims: the claim page is tonkfun-airdrop[dot]xyz today.",
    "On claims: the claim page is tonkfun-airdrop dot xyz today.",
    "On claims: the claim page is tonkfun-airdrop [.] xyz today.",
    "On claims: visit claim-tonkfun{.}app/login now.",
  ])("removes it: %s", (reply) => {
    const { text } = gate(reply);
    expect(text).not.toMatch(/airdrop|claim-tonkfun|\[\.\]|\(\.\)|\{\.\}|\[dot\]| dot xyz/i);
  });

  it("keeps ordinary words around the word 'dot'", () => {
    expect(gate("On names: the dot com bubble is old news, and a dot in a name is fine.").text).toBe(
      "On names: the dot com bubble is old news, and a dot in a name is fine.",
    );
  });

  it("keeps the names the bot may write, and LI.FI as LI·FI", () => {
    const { text, blocked } = gate("On bridging: Bridge compares Relay, Across, LI.FI and the canonical bridge on tonkfun.fun; Pump.fun and Bonk.fun are launchpads.");
    expect(blocked).toBeNull();
    expect(text).toBe("On bridging: Bridge compares Relay, Across, LI·FI and the canonical bridge on tonkfun.fun; Pump.fun and Bonk.fun are launchpads.");
    expect(gate("Bridge can route through li.fi too.").text).toBe("Bridge can route through li·fi too.");
    expect(gate("Never open li.fi/claim from a DM.").text).not.toContain("claim");
  });
});

describe("the answer gate: handles", () => {
  it.each([
    "On support: message TonkfunSupportDesk on Telegram for help.",
    "On support: the account named tonkfun_help_desk can help.",
    "On support: contact Support24 on Telegram.",
    "On support: write to tonkfunhelp for a refund.",
    "On support: DM CryptoAdmin99 and they'll fix it.",
    "On support: the helpdesk account MetaMaskSupport replies fast.",
  ])("blocks it: %s", (reply) => {
    expect(gate(reply).blocked).toBe("handle");
  });

  it.each([
    "On support: the team never DMs first, and admins never ask for your seed phrase.",
    "On support: use the contact on the Security page, not anyone who messages you.",
    "On wallets: if MetaMask says a launch is likely to fail, the Docs explain why.",
    "On help: I'm TonkFun's helper for tonkfun.fun, and the helpline button finds support near you.",
    "On Telegram: the official channel and group are linked below.",
    "Zu Admins: die Gruppenadmins schreiben dir nie zuerst.",
    "On the bot: ask TonkfunBot with /ask in the official group.",
  ])("lets ordinary words and the official names through: %s", (reply) => {
    expect(gate(reply, { official: ["TonkfunBot", "tonkfun_launches", "tonkfun_chat"] }).blocked).toBeNull();
  });

  it("lets the official channel's own username through, but not a look-alike", () => {
    const official = ["TonkfunBot", "tonkfun_launches", "tonkfun_chat"];
    expect(gate("On news: the channel tonkfun_launches posts every launch.", { official }).blocked).toBeNull();
    expect(gate("On news: the channel tonkfun_launch posts every launch.", { official }).blocked).toBe("handle");
  });
});

describe("the answer gate: addresses glued to letters", () => {
  const ADDR = `0x${"2".repeat(40)}`;

  it("replaces an EVM address glued to letters, whole run and all", () => {
    expect(gate(`On the contract: the launchpad is address${ADDR} on Robinhood Chain.`).text).toBe(`On the contract: the launchpad is ${PLACEHOLDER} on Robinhood Chain.`);
    expect(gate(`On the contract: it is CA${LOOKALIKE}.`).text).toBe(`On the contract: it is ${PLACEHOLDER}.`);
    expect(gate(`On the contract: it is ${ADDR}on Robinhood Chain.`).text).toBe(`On the contract: it is ${PLACEHOLDER} Robinhood Chain.`);
  });

  it("replaces a Solana address glued to letters", () => {
    expect(gate(`On the mint: it is CA${SOL_MINT}.`).text).toBe(`On the mint: it is ${PLACEHOLDER}.`);
    const allowedAddresses = new Set([LAUNCHPAD, SOL_MINT]);
    expect(gate(`On the mint: it is CA${SOL_MINT}.`, { allowedAddresses }).text).toBe(`On the mint: it is CA${SOL_MINT}.`);
  });

  it("keeps an allowed address, and an EVM address's tail is never read as a Solana one", () => {
    expect(gate(`On the contract: the launchpad is ${LAUNCHPAD}.`).text).toBe(`On the contract: the launchpad is ${LAUNCHPAD}.`);
    const allowedAddresses = new Set([LAUNCHPAD, ADDR]);
    expect(gate(`On the contract: it is ${ADDR}.`, { allowedAddresses }).text).toBe(`On the contract: it is ${ADDR}.`);
  });

  it("leaves a 64-character hash alone, as before", () => {
    const hash = "ab".repeat(32);
    expect(gate(`On the build: its hash is ${hash}.`).text).toBe(`On the build: its hash is ${hash}.`);
  });
});
