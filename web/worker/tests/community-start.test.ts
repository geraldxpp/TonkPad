// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_CHAT_ID, BOT_ID, GROUP_ID } from "./community-fixtures";
import { KEY, READY, SECOND_GROUP, sentTo, startBench, user } from "./community-start-fixtures";

let dir = "";
const benches: Array<ReturnType<typeof startBench>> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "community-start-"));
});
afterEach(async () => {
  for (const b of benches.splice(0)) b.stop();
  await rm(dir, { recursive: true, force: true });
});
const setup = (options: Parameters<typeof startBench>[1] = {}) => {
  const b = startBench(dir, options);
  benches.push(b);
  return b;
};

describe("starting the community agent", () => {
  it("stays off without its settings", async () => {
    const s = setup();
    s.deps.env = {};
    expect(await s.start()).toBeNull();
    expect(s.logs[0]).toMatch(/^community off/);
    expect(s.api.calls).toEqual([]);
  });

  it("starts with the groups that pass, admin lists loaded, and only { enabled: true } for the public health check", async () => {
    const s = setup();
    const hooks = await s.start();
    expect(hooks).not.toBeNull();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    expect(hooks?.isAdminChat(ADMIN_CHAT_ID)).toBe(true);
    expect(hooks?.owns(ADMIN_CHAT_ID)).toBe(false);
    expect(s.api.calls.map((c) => c.method)).toContain("getChatAdministrators");
    expect(hooks?.health()).toEqual({ enabled: true });
    expect(hooks?.aiOn()).toBe(true);
    expect(hooks?.groupAi?.()).toBe(true);
    // Set up as the brief says: nothing for the admins to fix.
    expect(sentTo(s.api.calls, ADMIN_CHAT_ID)).toEqual([]);
    expect(s.logs.join("\n")).not.toContain(KEY);
  });

  it("is off when the admin chat fails its checks", async () => {
    const s = setup({ telegram: { getChat: (p) => ({ id: p.chat_id, type: "supergroup", title: "Team", username: "team_public" }) } });
    expect(await s.start()).toBeNull();
    expect(s.logs.join("\n")).toContain("the admin chat has a public username");
  });

  it("is off when the site's Security page names no contact", async () => {
    const s = setup({ facts: { v: 1, hash: "b".repeat(64), inviteOnly: false, contact: null } });
    expect(await s.start()).toBeNull();
    expect(s.logs.join("\n")).toContain("no contact");
  });

  it("is off when the bot doesn't know itself yet", async () => {
    const s = setup();
    s.deps.me = () => null;
    expect(await s.start()).toBeNull();
  });

  it("drops a community group where the bot lacks its rights, and keeps the rest", async () => {
    const s = setup({
      env: { TELEGRAM_COMMUNITY_CHATS: `${GROUP_ID},${SECOND_GROUP}` },
      telegram: { getChatMember: (p) => (p.chat_id === SECOND_GROUP && p.user_id === BOT_ID ? { status: "member", user: user(BOT_ID) } : READY.getChatMember(p)) },
    });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    expect(hooks?.owns(SECOND_GROUP)).toBe(false);
    expect(s.logs.join("\n")).toContain(`community group ${SECOND_GROUP} dropped`);
  });

  it("writes community.json on save", async () => {
    const s = setup();
    const hooks = await s.start();
    hooks?.stop();
    await hooks?.save();
    const saved = JSON.parse(await readFile(join(dir, "community.json"), "utf8")) as { v: number };
    expect(saved.v).toBe(1);
  });

  it("runs without AI when the key is missing: moderation only", async () => {
    const s = setup({ env: { ANTHROPIC_API_KEY: "" } });
    const hooks = await s.start();
    expect(hooks?.owns(GROUP_ID)).toBe(true);
    expect(hooks?.aiOn()).toBe(false);
    expect(hooks?.groupAi?.()).toBe(false);
  });
});
