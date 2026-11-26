// @vitest-environment node
import { describe, expect, it } from "vitest";
import { en as communityEn } from "../src/telegram/i18n/community/en";
import { handleUpdate } from "../src/telegram/router";
import { GROUP } from "./community-fixtures";
import { NOW } from "./fixtures";
import { context, stubHooks } from "./telegram-fixtures";
import { ADMIN_CHAT, message } from "./telegram-fixtures-community";

/** A group's /help says how to ask the AI only while AI answers run in the community groups (K5), whatever private AI does. */

describe("the router and a group's /help", () => {
  const help = (o: { ai?: boolean; groupAi?: boolean }) => {
    const hooks = stubHooks({ groups: [GROUP.id], adminChat: ADMIN_CHAT.id, routed: "pass", ai: o.ai });
    return context({}, NOW, { community: o.groupAi === undefined ? hooks : { ...hooks, groupAi: () => o.groupAi === true } });
  };

  it("shows the AI lines when AI answers run in the community groups, though private AI is off", async () => {
    const { ctx, got } = help({ ai: false, groupAi: true });
    await handleUpdate(message("/help", GROUP), ctx);
    expect(got.sent[0].view.text).toContain(communityEn.help.groupAsk);
    expect(got.sent[0].view.text).toContain(communityEn.help.ai);
  });

  it("leaves them out when AI can't answer in the groups, though private AI is on", async () => {
    const { ctx, got } = help({ ai: true, groupAi: false });
    await handleUpdate(message("/help", GROUP), ctx);
    expect(got.sent[0].view.text).not.toContain(communityEn.help.ai);
    expect(got.sent[0].view.text).not.toContain(communityEn.help.groupAsk);
  });

  it("follows aiOn when the agent doesn't say", async () => {
    const on = help({ ai: true });
    await handleUpdate(message("/help", GROUP), on.ctx);
    expect(on.got.sent[0].view.text).toContain(communityEn.help.ai);
    const off = help({ ai: false });
    await handleUpdate(message("/help", GROUP), off.ctx);
    expect(off.got.sent[0].view.text).not.toContain(communityEn.help.ai);
  });
});

