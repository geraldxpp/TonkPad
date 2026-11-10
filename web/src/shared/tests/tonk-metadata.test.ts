import { describe, expect, it } from "vitest";
import { decodeAgent, decodeMetadata, encodeAgent, encodeMetadata, normalizeTelegram, normalizeWebsite, normalizeX } from "@/shared/tonk/metadata";
import { parseTonkMode, TONK_TESTNET, tonkNetwork } from "@/shared/tonk/networks";

describe("links", () => {
  it("reads an X handle from a handle or a profile link", () => {
    expect(normalizeX("@astropup")).toBe("astropup");
    expect(normalizeX("astropup")).toBe("astropup");
    expect(normalizeX("https://x.com/astropup/")).toBe("astropup");
    expect(normalizeX("twitter.com/Astro_Pup")).toBe("Astro_Pup");
    expect(normalizeX("  ")).toBe("");
    for (const bad of ["@way_too_long_for_a_handle", "https://x.com/astropup/status/1", "https://evil.example/astropup", "astro pup", "javascript:alert(1)"]) {
      expect(normalizeX(bad), bad).toBeNull();
    }
  });

  it("accepts Telegram links only on Telegram's hosts", () => {
    expect(normalizeTelegram("t.me/astropup")).toBe("https://t.me/astropup");
    expect(normalizeTelegram("https://telegram.me/+abc-DEF_1")).toBe("https://t.me/+abc-DEF_1");
    expect(normalizeTelegram("")).toBe("");
    for (const bad of ["astropup", "https://t.me/a/b", "https://t.me.evil.example/astropup", "tg://resolve?domain=x"]) {
      expect(normalizeTelegram(bad), bad).toBeNull();
    }
  });

  it("accepts a website as a domain or an http(s) link, and nothing else", () => {
    expect(normalizeWebsite("astropup.fun")).toBe("https://astropup.fun/");
    expect(normalizeWebsite("http://astropup.fun/about?x=1")).toBe("http://astropup.fun/about?x=1");
    expect(normalizeWebsite("")).toBe("");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "ftp://astropup.fun", "https://user:pass@astropup.fun", "localhost", "astro pup.fun", `https://a.fun/${"x".repeat(300)}`]) {
      expect(normalizeWebsite(bad), bad).toBeNull();
    }
  });
});

describe("what a mission stores", () => {
  it("writes compact JSON without the empty fields, and reads it back the same", () => {
    const stored = encodeMetadata({ description: "  A good boy on a long mission.  ", x: "@astropup", telegram: "t.me/astropup", website: "" });
    expect(stored).toBe('{"v":1,"description":"A good boy on a long mission.","x":"astropup","telegram":"https://t.me/astropup"}');
    expect(decodeMetadata(stored)).toEqual({ description: "A good boy on a long mission.", x: "astropup", telegram: "https://t.me/astropup", website: "" });
    expect(encodeMetadata({ description: "", x: "", telegram: "", website: "" })).toBe("");
  });

  it("treats text from the chain as untrusted", () => {
    const hostile = JSON.stringify({ v: 1, description: `<img src=x onerror=alert(1)>${"\u0000"}${"y".repeat(400)}`, x: "javascript:alert(1)", telegram: "https://evil.example/t.me/x", website: "javascript:alert(1)" });
    const read = decodeMetadata(hostile);
    // Kept as plain text for the page to print (never as HTML), cut to length, with control characters gone.
    expect(read.description.startsWith("<img src=x onerror=alert(1)>y")).toBe(true);
    expect(read.description).toHaveLength(280);
    expect(read).toMatchObject({ x: "", telegram: "", website: "" });
    for (const junk of ["", "ipfs://bafy…", "[1,2]", '"text"', "{not json", '{"description":42}']) {
      expect(decodeMetadata(junk), junk).toEqual({ description: "", x: "", telegram: "", website: "" });
    }
  });

  it("stores the agent's settings, or nothing when the agent is off", () => {
    const agent = { name: "Commander Astro", role: "Mission commander", voice: "hype" as const, brief: "Keep holders calm.\nNever promise a price." };
    expect(decodeAgent(encodeAgent(agent))).toEqual(agent);
    expect(encodeAgent(null)).toBe("");
    expect(decodeAgent("")).toBeNull();
    expect(decodeAgent('{"v":1,"name":"","role":"x"}')).toBeNull();
    expect(decodeAgent('{"v":1,"name":"Boo","voice":"shouty"}')).toEqual({ name: "Boo", role: "", voice: "tactical", brief: "" });
  });
});

describe("the network mode", () => {
  it("is off unless it names testnet or mock, and only testnet has contracts", () => {
    expect([parseTonkMode(undefined), parseTonkMode(""), parseTonkMode("mainnet"), parseTonkMode(" Testnet "), parseTonkMode("mock")]).toEqual(["off", "off", "off", "testnet", "mock"]);
    expect(tonkNetwork("testnet")).toBe(TONK_TESTNET);
    expect(tonkNetwork("mock")).toBeNull();
    expect(tonkNetwork("off")).toBeNull();
    expect(TONK_TESTNET.chainId).toBe(46630);
    expect(TONK_TESTNET.launchpad).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
