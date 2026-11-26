// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EditMemory } from "../src/telegram/mod/edits";
import { MIN, NOW } from "./fixtures";

const CHAT = -1001234567890;

describe("EditMemory", () => {
  it("knows when an edit added a link, handle or address", () => {
    const memory = new EditMemory();
    memory.remember(CHAT, 10, [], NOW);
    expect(memory.added(CHAT, 10, ["pumpsignals.site"], NOW + MIN)).toBe(true);
  });

  it("an unchanged edit, or one that only drops a key, added nothing", () => {
    const memory = new EditMemory();
    memory.remember(CHAT, 11, ["@pumpgroup", "evil.xyz"], NOW);
    expect(memory.added(CHAT, 11, ["@pumpgroup", "evil.xyz"], NOW + MIN)).toBe(false);
    expect(memory.added(CHAT, 11, ["evil.xyz"], NOW + MIN)).toBe(false);
  });

  it("counts an added key once: a second edit that keeps it added nothing", () => {
    const memory = new EditMemory();
    memory.remember(CHAT, 12, [], NOW);
    expect(memory.added(CHAT, 12, ["@pumpgroup"], NOW + MIN)).toBe(true);
    expect(memory.added(CHAT, 12, ["@pumpgroup"], NOW + 2 * MIN)).toBe(false);
  });

  it("without a record says null: never seen, another chat, or past 10 minutes", () => {
    const memory = new EditMemory();
    expect(memory.added(CHAT, 13, ["evil.xyz"], NOW)).toBeNull();
    memory.remember(CHAT, 14, [], NOW);
    expect(memory.added(-1009999999999, 14, ["evil.xyz"], NOW)).toBeNull();
    expect(memory.added(CHAT, 14, ["evil.xyz"], NOW + 10 * MIN)).toBeNull();
  });

  it("remembering again keeps the first time, and prune forgets after 10 minutes", () => {
    const memory = new EditMemory();
    memory.remember(CHAT, 15, [], NOW);
    memory.remember(CHAT, 15, ["evil.xyz"], NOW + 9 * MIN);
    expect(memory.added(CHAT, 15, ["evil.xyz"], NOW + 9 * MIN)).toBe(false);
    memory.prune(NOW + 10 * MIN);
    expect(memory.added(CHAT, 15, ["evil.xyz"], NOW + 9 * MIN)).toBeNull();
  });
});
