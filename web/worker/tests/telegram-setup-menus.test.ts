// @vitest-environment node
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shared/i18n/config";
import { type BotApi, TelegramError } from "../src/telegram/api";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import { createProfileSync } from "../src/telegram/index-profile";
import { type MenuScope, profileCalls, type ProfileOptions, syncProfile } from "../src/telegram/profile";
import { Sender } from "../src/telegram/sender";
import { emptyState, loadBotState, saveBotState } from "../src/telegram/state";
import { profileOptions } from "../src/telegram/wire";
import { stubHooks } from "./telegram-fixtures";

const GROUP = -1001234567890;
const SECOND = -1001111111111;
const ADMIN_CHAT = -1009876543210;
const BOT = 1;
const BOTH: ProfileOptions = { privateAi: true, reports: true, communityChats: [GROUP, SECOND], adminChat: ADMIN_CHAT, ai: true };

/** A Sender over a fake Bot API that records every call; `refuse` fails a call with a 400. */
function bench(refuse: (method: string, params: Record<string, unknown>) => boolean = () => false) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api: BotApi = {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      calls.push({ method, params });
      if (refuse(method, params)) throw new TelegramError(400, "Bad Request: chat not found", null);
      return true as T;
    },
  };
  const lines: string[] = [];
  // A clock that moves only when the Sender waits, so its 25 a second pass at once.
  let clock = 0;
  const sender = new Sender(api, (line) => void lines.push(line), () => clock, async (ms) => void (clock += ms));
  return { sender, calls, lines, log: (line: string) => void lines.push(line) };
}

const scopeOf = (c: { params: Record<string, unknown> }) => JSON.stringify(c.params.scope);
const deletesOf = (calls: ReadonlyArray<{ method: string; params: Record<string, unknown> }>) => calls.filter((c) => c.method === "deleteMyCommands");

describe("the profile's descriptions", () => {
  const off = profileCalls({ ...BOTH, ai: false });
  const on = profileCalls(BOTH);
  const texts = (calls: ReturnType<typeof profileCalls>, method: string, key: string) =>
    calls.filter(([m]) => m === method).map(([, p]) => ({ lang: typeof p.language_code === "string" ? p.language_code : "en", text: String(p[key]) }));

  it("keeps module 14's own words unless AI can answer, and names Claude and Anthropic when it can", () => {
    for (const { lang, text } of texts(off, "setMyDescription", "description")) expect(text, lang).toBe(BOT_DICTIONARIES[lang as keyof typeof BOT_DICTIONARIES].profile.description);
    for (const { lang, text } of texts(off, "setMyShortDescription", "short_description")) expect(text, lang).toBe(BOT_DICTIONARIES[lang as keyof typeof BOT_DICTIONARIES].profile.short);
    for (const { lang, text } of texts(on, "setMyDescription", "description")) {
      expect(text, lang).toBe(BOT_DICTIONARIES[lang as keyof typeof BOT_DICTIONARIES].profile.descriptionAi);
      expect(text, lang).toMatch(/Claude/);
      expect(text, lang).toMatch(/Anthropic/);
    }
    for (const { lang, text } of texts(on, "setMyShortDescription", "short_description")) expect(text, lang).toBe(BOT_DICTIONARIES[lang as keyof typeof BOT_DICTIONARIES].profile.shortAi);
  });

  it.each(LOCALES.map((l) => l.code))("%s: both sets fit Telegram's 120 and 512 characters", (code) => {
    const p = BOT_DICTIONARIES[code].profile;
    for (const short of [p.short, p.shortAi]) expect(short.length).toBeLessThanOrEqual(120);
    for (const description of [p.description, p.descriptionAi]) expect(description.length).toBeLessThanOrEqual(512);
    expect(p.descriptionAi).not.toBe(p.description);
  });

  it("chooses the AI set from what the agent says now: private AI, or a community group with AI", () => {
    const env = { ANTHROPIC_API_KEY: `sk-ant-api03-${"x".repeat(40)}`, TELEGRAM_COMMUNITY_CHATS: String(GROUP), TELEGRAM_ADMIN_CHAT_ID: String(ADMIN_CHAT), TELEGRAM_OWNER_IDS: "7001" };
    const snapshot = "/data/snapshot.json";
    expect(profileOptions(stubHooks({ groups: [GROUP], adminChat: ADMIN_CHAT }), env, snapshot).ai).toBe(true);
    // AI stopped (an owner's /ai off, billing, a refused key at the last sync): the originals, and no /ask in the menu.
    const stopped = profileOptions(stubHooks({ groups: [GROUP], adminChat: ADMIN_CHAT, ai: false }), env, snapshot);
    expect(stopped).toMatchObject({ ai: false, privateAi: false, communityChats: [GROUP] });
    // Private AI off, AI still answering in the group.
    const groupOnly = profileOptions({ ...stubHooks({ groups: [GROUP], adminChat: ADMIN_CHAT, ai: false }), groupAi: () => true }, env, snapshot);
    expect(groupOnly).toMatchObject({ ai: true, privateAi: false });
    // No group running and private AI off: nothing says AI.
    expect(profileOptions({ ...stubHooks({ adminChat: ADMIN_CHAT, ai: false }), groupAi: () => true }, { ...env, TELEGRAM_AI_PRIVATE: "off" }, snapshot).ai).toBe(false);
  });
});

describe("syncProfile and the chat-scoped menus", () => {
  it("deletes a dropped group's two menus in every language before it sets the rest, and forgets them", async () => {
    const first = bench();
    const set = await syncProfile(first.sender, { hash: "", menus: [] }, first.log, BOT, BOTH);
    expect(deletesOf(first.calls)).toEqual([]);
    expect(set?.menus).toEqual([{ type: "chat", chat: GROUP }, { type: "chat_administrators", chat: GROUP }, { type: "chat", chat: SECOND }, { type: "chat_administrators", chat: SECOND }, { type: "chat", chat: ADMIN_CHAT }]);
    const later = bench();
    const next = await syncProfile(later.sender, set ?? { hash: "", menus: [] }, later.log, BOT, { ...BOTH, communityChats: [GROUP] });
    const deletes = deletesOf(later.calls);
    expect(deletes).toHaveLength(2 * LOCALES.length);
    expect(new Set(deletes.map(scopeOf))).toEqual(new Set([JSON.stringify({ type: "chat", chat_id: SECOND }), JSON.stringify({ type: "chat_administrators", chat_id: SECOND })]));
    expect(new Set(deletes.map((c) => c.params.language_code ?? "en"))).toEqual(new Set(LOCALES.map((l) => l.code)));
    const lastDelete = later.calls.map((c) => c.method).lastIndexOf("deleteMyCommands");
    expect(later.calls.findIndex((c) => c.method === "setMyCommands")).toBeGreaterThan(lastDelete);
    expect(later.calls.some((c) => c.method === "setMyCommands" && scopeOf(c).includes(String(SECOND)))).toBe(false);
    expect(next?.menus.some((m) => m.chat === SECOND)).toBe(false);
    expect(next?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(later.lines).toContain(`profile set in ${LOCALES.length} languages; 2 old menus deleted`);
  });

  it("deletes the admin chat's menu when it no longer passes, and every community menu when community mode is off", async () => {
    const { sender, calls, log } = bench();
    const menus: MenuScope[] = [{ type: "chat", chat: GROUP }, { type: "chat_administrators", chat: GROUP }, { type: "chat", chat: ADMIN_CHAT }];
    const next = await syncProfile(sender, { hash: "old", menus }, log, BOT, { privateAi: false, reports: false, communityChats: [], adminChat: null, ai: false });
    expect(new Set(deletesOf(calls).map(scopeOf))).toEqual(new Set(menus.map((m) => JSON.stringify({ type: m.type, chat_id: m.chat }))));
    expect(next?.menus).toEqual([]);
  });

  it("keeps a menu whose delete failed, tries it again at the next sync without setting the rest again, and forgets it after 3", async () => {
    const refused = (method: string, params: Record<string, unknown>) => method === "deleteMyCommands" && JSON.stringify(params.scope).includes(String(SECOND));
    const options: ProfileOptions = { ...BOTH, communityChats: [GROUP] };
    let state = { hash: "", menus: [{ type: "chat", chat: SECOND }] as MenuScope[] };
    const sets: number[] = [];
    for (let sync = 1; sync <= 3; sync += 1) {
      const b = bench(refused);
      const next = await syncProfile(b.sender, state, b.log, BOT, options);
      sets.push(b.calls.filter((c) => c.method.startsWith("setMy")).length);
      state = { hash: next?.hash ?? state.hash, menus: [...(next?.menus ?? state.menus)] };
      if (sync < 3) expect(state.menus).toContainEqual({ type: "chat", chat: SECOND, misses: sync });
      else expect(b.lines.join("\n")).toContain("couldn't be deleted at 3 syncs");
    }
    // Set once; the later syncs only tried the delete again.
    expect(sets[0]).toBeGreaterThan(0);
    expect(sets.slice(1)).toEqual([0, 0]);
    expect(state.menus.some((m) => m.chat === SECOND)).toBe(false);
    const quiet = bench();
    expect(await syncProfile(quiet.sender, state, quiet.log, BOT, options)).toBeNull();
    expect(quiet.calls).toEqual([]);
  });

  it("keeps the remembered menus in telegram.json, and ignores anything malformed there", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tonk-menus-"));
    const path = join(dir, "telegram.json");
    const state = emptyState();
    state.menus = [{ type: "chat_administrators", chat: GROUP }, { type: "chat", chat: ADMIN_CHAT, misses: 2 }];
    await saveBotState(path, state);
    expect((await loadBotState(path)).menus).toEqual(state.menus);
    await writeFile(path, JSON.stringify({ v: 1, profileHash: "x", menus: [{ type: "user", chat: 5 }, { type: "chat", chat: "-100" }, { type: "chat", chat: GROUP, misses: -1 }, null, { type: "chat", chat: GROUP }] }));
    expect((await loadBotState(path)).menus).toEqual([{ type: "chat", chat: GROUP }]);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ profileHash: "x" });
  });
});

describe("the profile's re-sync", () => {
  it("runs one sync at a time, and once more after a change heard during one, with the options read then", async () => {
    const { sender, calls, log } = bench();
    const state = emptyState();
    let options: ProfileOptions = BOTH;
    let saved = 0;
    const sync = createProfileSync({ sender, state, persist: () => void (saved += 1), log, botId: BOT, options: () => options });
    sync.run();
    options = { ...BOTH, communityChats: [GROUP] };
    sync.run();
    sync.run();
    await sync.idle();
    await sync.idle();
    expect(deletesOf(calls)).toHaveLength(2 * LOCALES.length);
    expect(state.menus.some((m) => m.chat === SECOND)).toBe(false);
    expect(state.profileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved).toBe(2);
  });
});
