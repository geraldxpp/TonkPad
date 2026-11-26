// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TgMessage } from "../src/telegram/types";
import { callsOf, groupMessage, MEMBER, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, mention, S, settle } from "./community-pipeline-fixtures";

const punished = (h: ReturnType<typeof harness>) => h.out.log.filter((c) => ["restrict", "ban", "kick"].includes(c.op));
const warnings = (h: ReturnType<typeof harness>, text: string) => h.sends().filter((s) => s[1] === text);

/** rules#1: asking whether a link is real, the bot included, is a report: the link goes, nobody is punished. */
describe("the community pipeline: a legitimacy question is a report (rules#1)", () => {
  const ASKS: Array<[string, () => TgMessage]> = [
    ["a mention", () => mention("is tonkfun-airdrop.xyz real? got it in a DM")],
    ["/ask", () => groupMessage("/ask is tonkfun-airdrop.xyz real?", { entities: [{ type: "bot_command", offset: 0, length: 4 }] })],
    ["a greeting", () => groupMessage("hey, is tonkfun-airdrop.xyz real?")],
    ["Russian", () => groupMessage("tonkfun-airdrop.xyz это официальный сайт?")],
  ];

  it.each(ASKS)("%s: the link is deleted with the warning, and neither a member nor a new member is muted or banned", async (_, make) => {
    for (const standing of ["member", "new"] as const) {
      const h = harness({ client: null });
      if (standing === "new") h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
      const m = make();
      await h.send(m);
      await settle();
      expect(punished(h), standing).toEqual([]);
      expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
      expect(h.removed()).toContain(m.message_id);
      expect(warnings(h, testWords.safety.scamReport)).toHaveLength(1);
      expect(h.alerts.map((a) => a.kind)).toContain("scam_report");
    }
  });
});

/** rules#2: a member asking the team, or anyone, to message them is kept and warned, never punished. */
describe("the community pipeline: a help request that asks to be messaged (rules#2)", () => {
  it.each(["admins, DM me", "Mods: please contact me if my launch is stuck", "my launch is stuck, can someone DM me", "管理员请私信我，我的钱包被盗了"])(
    "keeps %s, warns once about DMs, and records nothing",
    async (text) => {
      for (const mode of ["normal", "strict"] as const) {
        const h = harness({ client: null, mode });
        h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
        const m = groupMessage(text);
        await h.send(m);
        await settle();
        expect(h.removed(), mode).toEqual([]);
        expect(punished(h)).toEqual([]);
        expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
        const warned = warnings(h, testWords.safety.dmWarning);
        expect(warned).toHaveLength(1);
        expect(warned[0][2]).toMatchObject({ replyTo: m.message_id });
      }
    },
  );

  it("a victim's report that asks the admins to DM them stays a report: the link goes, nobody is banned", async () => {
    const h = harness({ client: null });
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    const m = groupMessage("I got scammed by tonkfun-claim.xyz, please DM me admins, my funds are gone");
    await h.send(m);
    await settle();
    expect(punished(h)).toEqual([]);
    expect(h.removed()).toEqual([m.message_id]);
    expect(warnings(h, testWords.safety.scamReport)).toHaveLength(1);
    // One warning is enough: the report's own covers DMs.
    expect(warnings(h, testWords.safety.dmWarning)).toEqual([]);
  });

  it("warns a group about DMs at most once per pace, and never in observe mode", async () => {
    const h = harness({ client: null });
    for (const [i, text] of ["admins, DM me", "can an admin DM me?"].entries()) {
      h.clock.now = NOW + i * 10 * S;
      await h.send(groupMessage(text));
    }
    await settle();
    expect(warnings(h, testWords.safety.dmWarning)).toHaveLength(1);
    const quiet = harness({ client: null, mode: "observe" });
    await quiet.send(groupMessage("admins, DM me"));
    await settle();
    expect(warnings(quiet, testWords.safety.dmWarning)).toEqual([]);
  });

  it("an offer is still fake support: deleted, and a new member banned", async () => {
    const h = harness({ client: null });
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    await h.send(groupMessage("DM me to claim your airdrop"));
    await settle();
    expect(callsOf(h.out.log, "ban")).toEqual([[GROUP_ID, MEMBER.id]]);
  });
});

/** rules#3: asking how to connect or claim beside a dapp link is asking for help. */
describe("the community pipeline: a help request beside a dapp link (rules#3)", () => {
  it.each(["can't connect wallet on https://raydium.io, anyone else?", "no puedo conectar la billetera en https://raydium.io", "我无法连接钱包 https://raydium.io"])(
    "%s: only the link rule's removal, never a mute or a ban",
    async (text) => {
      for (const standing of ["member", "new"] as const) {
        const h = harness({ client: null });
        if (standing === "new") h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
        const m = groupMessage(text);
        await h.send(m);
        await settle();
        expect(punished(h), standing).toEqual([]);
        expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).certain).toBe(0);
        expect(h.removed()).toEqual([m.message_id]);
      }
    },
  );
});
