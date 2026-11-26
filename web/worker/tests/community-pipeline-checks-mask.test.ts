// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ClaudeRequest } from "../src/telegram/claude/types";
import { maskForModel } from "../src/telegram/mod/secrets";
import type { TgMessage, TgMessageEntity } from "../src/telegram/types";
import { groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, GROUP_ID, harness, mention, person, S, scripted, settle, verdict } from "./community-pipeline-fixtures";
import { dm, press } from "./community-qa-fixtures";

/**
 * Fix round 2 (rules#8, admin-privacy-docs#1): what Telegram marked as a
 * phone number reaches Anthropic at no call site, whatever its format. The
 * number below is one the patterns can't tell from an amount
 * ("13812345678"), and no phone word stands before it ("reach me at"; "call
 * me on" is one the patterns read), so only Telegram's own mark can hide it:
 * in Haiku's check, a question to the bot, an unprompted candidate, a
 * private /ask, a private text sent with Ask, and the message an /ask
 * replies to. In the group the rules remove a member's contact details
 * before any check, so the group's cases are a trusted member's, whose
 * details stay up.
 */

const NUMBER = "13812345678";
const TEXT = {
  check: `🚀 help, my buy failed, can the team reach me at ${NUMBER} or tomorrow?`,
  caption: `my buy failed, can the team reach me at ${NUMBER}?`,
  question: `my buy failed, reach me at ${NUMBER}, what now?`,
  candidate: `How long does the creator lock last on tonkfun? reach me at ${NUMBER}`,
  replied: `my buy failed, can someone reach me at ${NUMBER}?`,
  ask: `/ask my buy failed, reach me at ${NUMBER}`,
  offered: `my buy failed, reach me at ${NUMBER}`,
};

/** Telegram's phone_number mark on NUMBER, at its UTF-16 offset in `text`. */
const phoneMark = (text: string): TgMessageEntity => ({ type: "phone_number", offset: text.indexOf(NUMBER), length: NUMBER.length });
/** A harness whose members (MEMBER, 801, 811) are trusted: their contact details aren't removed. */
function trusting(client: ReturnType<typeof scripted>) {
  const h = harness({ client });
  for (const id of [MEMBER.id, 801, 811]) h.records.trust(GROUP_ID, id, "0123456789abcdef", NOW);
  return h;
}
const sent = (calls: readonly ClaudeRequest[]) => calls.map((c) => JSON.stringify(c.params));
const expectHidden = (calls: readonly ClaudeRequest[], kinds: readonly string[]) => {
  expect(calls.map((c) => c.kind)).toEqual(kinds);
  for (const params of sent(calls)) {
    expect(params).not.toContain(NUMBER);
    expect(params).toContain("[hidden]");
  }
};

describe("Telegram's phone_number marks at every model call site (rules#8)", () => {
  it("are what hides the number below: the patterns alone leave it in every text here", () => {
    for (const text of Object.values(TEXT)) expect(maskForModel(text), text).toContain(NUMBER);
  });

  it("hide the number in Haiku's check, on the offsets of the message's own text (an emoji before it counts twice)", async () => {
    const h = trusting(scripted({ triage: verdict({ question: "none" }) }));
    await h.send(groupMessage(TEXT.check, { entities: [phoneMark(TEXT.check)] }));
    await settle();
    expectHidden(h.calls, ["triage"]);
  });

  it("hide it in a caption's check, by its caption_entities", async () => {
    const h = trusting(scripted({ triage: verdict({ question: "none" }) }));
    const caption = TEXT.caption;
    const m: TgMessage = { ...groupMessage(""), text: undefined, photo: [{ file_id: "p", file_unique_id: "p", width: 1, height: 1 }], caption, caption_entities: [phoneMark(caption)] };
    await h.send(m);
    await settle();
    expectHidden(h.calls, ["triage"]);
  });

  it("hide it in a question to the bot: its check and its answer", async () => {
    const h = trusting(scripted({ triage: verdict(), answer: answer() }));
    const m = mention(TEXT.question);
    await h.send({ ...m, entities: [...(m.entities ?? []), phoneMark(m.text ?? "")] });
    await settle();
    expectHidden(h.calls, ["triage", "answer"]);
  });

  it("hide it in an unprompted candidate's answer", async () => {
    const h = trusting(scripted({ triage: verdict(), answer: answer() }));
    await h.send(groupMessage(TEXT.candidate, { from: person(801), entities: [phoneMark(TEXT.candidate)] }));
    await settle();
    await h.tick(NOW + 90 * S);
    await settle();
    expectHidden(h.calls, ["triage", "answer"]);
  });

  it("hide it in the message an /ask replies to", async () => {
    const h = trusting(scripted({ triage: verdict(), answer: answer() }));
    const target = groupMessage(TEXT.replied, { from: person(811), entities: [phoneMark(TEXT.replied)] });
    await h.send(target);
    await settle();
    h.clock.now = NOW + 5 * S;
    await h.send(groupMessage("/ask", { from: person(812), reply_to_message: target, entities: [{ type: "bot_command", offset: 0, length: 4 }] }));
    await settle();
    const answers = h.calls.filter((c) => c.kind === "answer");
    expect(answers).toHaveLength(1);
    expectHidden(h.calls, h.calls.map((c) => c.kind));
  });

  it("hide it in a private /ask and in a private text sent with Ask", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const ask = TEXT.ask;
    await h.community.qa.askPrivate({ ...dm(ask), entities: [{ type: "bot_command", offset: 0, length: 4 }, phoneMark(ask)] }, ask.slice(5));
    await settle();
    // Past the asker's one answer per 15 seconds.
    h.clock.now = NOW + 20 * S;
    const text = TEXT.offered;
    const m = { ...dm(text), entities: [phoneMark(text)] };
    await h.community.qa.offerPrivate(m, text);
    await h.community.qa.onPress(press(`a:${m.message_id}`));
    await settle();
    expectHidden(h.calls, ["answer", "answer"]);
  });
});
