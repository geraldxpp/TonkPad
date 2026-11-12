import { describe, expect, it } from "vitest";
import { chainText, decodeAgent, decodeMetadata, encodeAgent, encodeMetadata, normalizeTelegram, normalizeWebsite, normalizeX } from "@/shared/tonk/metadata";
import { mainnetNetwork, parseTonkMode, ROBINHOOD_UNISWAP, TONK_TESTNET, testnetNetwork, tonkNetwork } from "@/shared/tonk/networks";

/** 👻: one character, two UTF-16 units. */
const GHOST = "\u{1F47B}";
const NO_LINKS = { x: "", telegram: "", website: "" };

describe("text read from the chain", () => {
  it("drops zero-width, direction, tag and control characters from a name or ticker", () => {
    // U+202E would draw "YTSOHG" right to left, as "GHOSTY".
    expect(chainText("\u{202E}YTSOHG\u{200B}", 64)).toBe("YTSOHG");
    expect(chainText("U\u{200B}SD\u{E0041}C\u{0}\u{9B}", 16)).toBe("USDC");
    expect(chainText("\u{2066}Gho\u{AD}sty\u{2069}\u{FE0F}\u{3164}", 64)).toBe("Ghosty");
  });

  it("shows line breaks and spaces of any width as one plain space, on one line", () => {
    expect(chainText(" Ghost\u{3000}\u{2028}\nCoin\t\u{A0}Two ", 64)).toBe("Ghost Coin Two");
  });

  it("counts characters, never cutting an emoji in half", () => {
    expect(chainText(`${"x".repeat(15)}${GHOST}y`, 16)).toBe(`${"x".repeat(15)}${GHOST}`);
    expect(chainText(GHOST.repeat(20), 16)).toBe(GHOST.repeat(16));
  });

  it("is bounded before it is walked, leaving no half character where the bound falls", () => {
    // 8 × 16 units are read: here 127 zero-width spaces and half a ghost.
    expect(chainText(`${"\u{200B}".repeat(127)}${GHOST}`, 16)).toBe("");
    expect(chainText(`${"\u{200B}".repeat(126)}${GHOST}Z`, 16)).toBe(GHOST);
  });

  it("is empty when nothing shows, or when it isn't text", () => {
    expect(chainText("\u{200B}\u{202E}\u{3164} \u{E0041}\u{0}", 64)).toBe("");
    expect(chainText(42, 64)).toBe("");
    expect(chainText(undefined, 64)).toBe("");
  });

  it("keeps a description's line breaks, and drops what doesn't show on each line", () => {
    const stored = JSON.stringify({ v: 1, description: "Line\u{202E} one\u{200B}\r\n\u{3000}Line two\u{E0041}\n\nLast\u{2028}line\u{9B}" });
    expect(decodeMetadata(stored).description).toBe("Line one\nLine two\n\nLast\nline");
    expect(decodeMetadata(JSON.stringify({ v: 1, description: `${"d".repeat(279)}${GHOST}${GHOST}` })).description).toBe(`${"d".repeat(279)}${GHOST}`);
  });

  it("shows the agent's name and role on one line, and keeps its brief's line breaks", () => {
    const stored = JSON.stringify({ v: 1, name: "Commander\nAstro\u{200B}", role: "\u{202E}Mission\tcommander", voice: "hype", brief: "Keep holders calm.\u{E0041}\r\nNever promise a price.\u{FEFF}" });
    expect(decodeAgent(stored)).toEqual({ name: "Commander Astro", role: "Mission commander", voice: "hype", brief: "Keep holders calm.\nNever promise a price." });
    // A name with nothing visible is no agent.
    expect(decodeAgent(JSON.stringify({ v: 1, name: "\u{200B}\u{202E}", role: "Ghost" }))).toBeNull();
  });

  it("writes to the chain only what shows, line breaks kept", () => {
    expect(encodeMetadata({ description: "A good\u{200B} boy.\u{202E}\r\nOn a mission.", ...NO_LINKS })).toBe('{"v":1,"description":"A good boy.\\nOn a mission."}');
    expect(encodeMetadata({ description: "\u{200B}\u{2800}", ...NO_LINKS })).toBe("");
    const agent = JSON.parse(encodeAgent({ name: "Astro\u{200B}", role: "Mission\u{2028}commander", voice: "meme", brief: "Calm.\u{FE0F}\nHonest." })) as unknown;
    expect(agent).toEqual({ v: 1, name: "Astro", role: "Mission commander", voice: "meme", brief: "Calm.\nHonest." });
  });
});

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
    expect(decodeMetadata(stored)).toEqual({ description: "A good boy on a long mission.", x: "astropup", telegram: "https://t.me/astropup", website: "", image: "" });
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
      expect(decodeMetadata(junk), junk).toEqual({ description: "", x: "", telegram: "", website: "", image: "" });
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
  it("is off unless it names testnet, mainnet or mock", () => {
    expect([parseTonkMode(undefined), parseTonkMode(""), parseTonkMode("main"), parseTonkMode(" Testnet "), parseTonkMode("MAINNET"), parseTonkMode("mock")]).toEqual(["off", "off", "off", "testnet", "mainnet", "mock"]);
    expect(tonkNetwork("testnet")).toBe(TONK_TESTNET);
    expect(tonkNetwork("mock")).toBeNull();
    expect(tonkNetwork("off")).toBeNull();
    expect(TONK_TESTNET.chainId).toBe(46630);
    expect(TONK_TESTNET.launchpad).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("connects mainnet only once the deployment's addresses and block are set, and keeps them lowercase", () => {
    // This build sets no deployment, so mainnet mode connects nothing and Launch stays "coming soon".
    expect(tonkNetwork("mainnet")).toBeNull();
    const deployment = { launchpad: " 0x4bB2D0A3F7c1E2b4a5C6d7E8f9A0b1C2d3E404d6 ", migrator: "0xC78C9b0a1D2e3F4a5B6c7D8e9F0a1B2c3D4e3d45", block: "111619078" };
    expect(mainnetNetwork(deployment)).toEqual({
      chainId: 4663,
      name: "Robinhood Chain",
      unit: "ETH",
      rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
      explorerUrl: "https://robinhoodchain.blockscout.com",
      faucetUrl: null,
      launchpad: "0x4bb2d0a3f7c1e2b4a5c6d7e8f9a0b1c2d3e404d6",
      migrator: "0xc78c9b0a1d2e3f4a5b6c7d8e9f0a1b2c3d4e3d45",
      externalRouter: null,
      uniswap: {
        poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
        universalRouter: "0x204faca1764b154221e35c0d20abb3c525710498",
        permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
        quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
      },
      launchpadBlock: 111619078,
    });
    expect(TONK_TESTNET.uniswap).toBeNull();
    for (const bad of [
      { ...deployment, launchpad: undefined },
      { ...deployment, migrator: "0x123" },
      { ...deployment, migrator: deployment.launchpad.trim().toLowerCase() },
      { ...deployment, block: "" },
      { ...deployment, block: "0" },
      { ...deployment, block: "12.5" },
      { ...deployment, block: "1e30" },
    ]) {
      expect(mainnetNetwork(bad)).toBeNull();
    }
  });

  it("points a testnet preview at a fresh deployment, trading pools only where its router and quoter are named", () => {
    const none = { launchpad: undefined, migrator: undefined, block: undefined };
    const noPools = { poolManager: undefined, universalRouter: undefined, permit2: undefined, quoter: undefined };
    // Unset, as on the testnet site today: the built-in deployment, with no pool trading.
    expect(testnetNetwork(none, noPools)).toBe(TONK_TESTNET);
    const fresh = { launchpad: "0x1111111111111111111111111111111111111111", migrator: "0x2222222222222222222222222222222222222222", block: "152000000" };
    const pools = {
      poolManager: " 0x5b29D2869A76ceeb969d090BA73cAc506b128519 ",
      universalRouter: "0x3333333333333333333333333333333333333333",
      permit2: "0x4bB2c9fF76C8f5774C35362CC1137cB014B604d6",
      quoter: "0x4444444444444444444444444444444444444444",
    };
    expect(testnetNetwork(fresh, pools)).toEqual({
      ...TONK_TESTNET,
      launchpad: fresh.launchpad,
      migrator: fresh.migrator,
      launchpadBlock: 152000000,
      externalRouter: null,
      uniswap: { poolManager: "0x5b29d2869a76ceeb969d090ba73cac506b128519", universalRouter: pools.universalRouter, permit2: "0x4bb2c9ff76c8f5774c35362cc1137cb014b604d6", quoter: pools.quoter },
    });
    // A fresh deployment without a router and quoter: its pools don't trade here.
    expect(testnetNetwork(fresh, noPools).uniswap).toBeNull();
    expect(testnetNetwork(fresh, { ...pools, quoter: "0x12" }).uniswap).toBeNull();
    expect(testnetNetwork(fresh, { ...pools, quoter: pools.universalRouter }).uniswap).toBeNull();
    // A malformed deployment keeps the built-in one.
    expect(testnetNetwork({ ...fresh, block: "0" }, noPools)).toBe(TONK_TESTNET);
    // Mainnet never takes Uniswap from the build: always Uniswap's own contracts.
    expect(mainnetNetwork(fresh)?.uniswap).toEqual(ROBINHOOD_UNISWAP);
  });
});
