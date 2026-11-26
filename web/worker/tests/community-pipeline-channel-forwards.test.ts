// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createModeration } from "../src/telegram/community/pipeline-mod";
import type { Who } from "../src/telegram/community/pipeline-who";
import { type AdminAlert, type Strictness, STRICTNESS_LEVELS, type TriageVerdict } from "../src/telegram/community/types";
import { decide, type ModDeps } from "../src/telegram/mod/actions";
import { EditMemory } from "../src/telegram/mod/edits";
import { FloodWatch } from "../src/telegram/mod/flood";
import type { OfficialChannel } from "../src/telegram/mod/media";
import { createRaidWatch } from "../src/telegram/mod/raid";
import { botsOwnOf } from "../src/telegram/mod/rules-scan";
import { shouldTriage } from "../src/telegram/mod/triage";
import { launchPost } from "../src/telegram/posts";
import type { TgMessage } from "../src/telegram/types";
import { packSource } from "./agent-answer-fixtures";
import { adminInfo, callsOf, fakeAdmins, GROUP_ID, groupMessage, MEMBER, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { ADMIN_ID, ME, settle, SITE } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";
import { token } from "./telegram-fixtures";

/**
 * A member's forward of the official channel's post (community/pipeline-mod.ts
 * with the channel TELEGRAM_CHANNEL_ID names; mod/media.ts fromChannel): the
 * bot's own words, known by the channel's chat ID, and by its username only
 * when TELEGRAM_CHANNEL_ID gives no ID. A launch post carries a token's name,
 * chosen by its creator, and its address: never sent to Haiku's check, and
 * never punishing whoever passes it on, new or not, in any mode, though a
 * drainer's or look-alike's site a name spells is still removed. Moderation
 * is built here as community/index-build.ts builds it, from the shared fakes.
 */

const CHANNEL_ID = -1_001_555_000_111;
const OTHER_ID = -1_001_999_000_222;
const BY_ID: OfficialChannel = { id: CHANNEL_ID, username: "tonkfun_launches" };
const BY_NAME: OfficialChannel = { id: null, username: "tonkfun_launches" };
const STANDINGS = ["member", "new"] as const;
type Standing = (typeof STANDINGS)[number];
const SCAM: TriageVerdict = { verdict: "scam", category: "phishing", question: "none", needs_human: "none", dm_scam_mention: false, language: "en", reason: "Promises free ETH." };
/** What would punish the member: a mute, a ban or a removal from the group. */
const SANCTIONS = ["restrict", "ban", "kick"] as const;

/** The channel's launch post for a token named `name`, as a member's forward of it arrives: from the chat `id`, which holds the channel's username. */
function launch(name: string, id = CHANNEL_ID): TgMessage {
  const view = launchPost(token({ name }), { lock: null, crewBps: 0 }, "en", SITE);
  return groupMessage(view.text.replace(/<[^>]+>/g, ""), {
    forward_origin: { type: "channel", date: 1, chat: { id, type: "channel", title: "Tonkfun Launches", username: "tonkfun_launches" } },
    reply_markup: view.keyboard,
  });
}

const who = (standing: Standing): Who => ({ standing, user: MEMBER.id, senderChat: null, name: "Sam", username: null, tag: null, lang: "en", trustedName: false });

/** One message through the rules and their decision, as the pipeline runs them, with the official channel given or not; and whether Haiku's check would read it. */
async function moderate(m: TgMessage, channel: OfficialChannel | null, mode: Strictness, standing: Standing) {
  const out = recordOut();
  const records = memoryRecords({ strictness: mode });
  const alerts: AdminAlert[] = [];
  const flood = new FloodWatch();
  const mod: ModDeps = { out, records, words: () => testWords, alerts: { alert: (a) => void alerts.push(a) }, recentIds: (chat, user, at) => flood.recent(chat, user, at), bot: () => "TonkfunBot", now: () => NOW };
  const raid = createRaidWatch({ ...mod, groupLang: "en", settings: records.settings, update: records.updateSettings, chats: [GROUP_ID] });
  const moderation = createModeration({
    records, admins: fakeAdmins({ [GROUP_ID]: [adminInfo(ADMIN_ID)] }), raid, flood, edits: new EditMemory(), standing: () => standing, mod, allow: ALLOW, pack: packSource(), me: () => ME,
    groupLang: "en", channel,
  });
  const result = moderation.check(m, who(standing), NOW);
  const moderated = moderation.fresh(m, who(standing), result, NOW);
  await settle();
  const removed = callsOf(out.log, "remove").flatMap((c) => c[1] as number[]);
  const punished = SANCTIONS.some((op) => callsOf(out.log, op).length > 0) || records.offences(GROUP_ID, MEMBER.id, NOW).n > 0;
  return { result, moderated, removed, punished, own: botsOwnOf(result.markers), checked: shouldTriage(result, standing, { raid: moderated.ctx.raid, removedLink: moderated.removedLink }) };
}

describe("the community pipeline's moderation: a member forwards the official channel's post", () => {
  it("is the bot's own words, known by the channel's chat ID: never sent to Haiku's check, nor punished, in every mode", async () => {
    for (const mode of STRICTNESS_LEVELS) {
      for (const standing of STANDINGS) {
        const label = `${mode} ${standing}`;
        const r = await moderate(launch("FREE ETH AIRDROP claim now"), BY_ID, mode, standing);
        expect(r.own, label).toBe(true);
        expect(r.checked, label).toBe(false);
        expect(r.removed, label).toEqual([]);
        expect(r.punished, label).toBe(false);
        // A verdict, should one ever come, could remove it, never punish anyone for it.
        const d = decide(r.moderated.hits, SCAM, r.moderated.ctx);
        expect((d?.actions ?? []).filter((a) => a.kind !== "delete"), label).toEqual([]);
        expect(d?.offence ?? "none", label).toBe("none");
      }
    }
  });

  it("is removed when a token's name spells a drainer's or a look-alike's site, in every mode, and nobody is punished", async () => {
    for (const mode of STRICTNESS_LEVELS) {
      for (const standing of STANDINGS) {
        for (const name of ["airdrop dot xyz", "tonkfun dot xyz"]) {
          const m = launch(name);
          const r = await moderate(m, BY_ID, mode, standing);
          const label = `${mode} ${standing} ${name}`;
          expect(r.removed, label).toEqual([m.message_id]);
          expect(r.punished, label).toBe(false);
          expect(r.checked, label).toBe(false);
        }
      }
    }
  });

  it("is known by the channel's username only when TELEGRAM_CHANNEL_ID gives no ID", async () => {
    const elsewhere = launch("Whoa the Tarsier", OTHER_ID);
    expect(await moderate(elsewhere, BY_NAME, "normal", "new")).toMatchObject({ own: true, checked: false, removed: [], punished: false });
    // Once the ID is known, another chat holding the channel's username is no voucher of the bot's words: a new member's address goes to the check.
    expect(await moderate(elsewhere, BY_ID, "normal", "new")).toMatchObject({ own: false, checked: true, punished: false });
    expect(await moderate(launch("Whoa the Tarsier"), BY_ID, "normal", "new")).toMatchObject({ own: true, checked: false });
  });

  it("is a forward vouched for by username alone without the channel, as before: the member's own words, read by the check", async () => {
    for (const standing of STANDINGS) {
      const r = await moderate(launch("Whoa the Tarsier"), null, "normal", standing);
      expect(r, standing).toMatchObject({ own: false, checked: true, removed: [], punished: false });
    }
  });
});
