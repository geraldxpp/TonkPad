// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildKnowledge, KNOWLEDGE_SECTIONS } from "@/shared/bot/knowledge";
import { BRIDGE_NETWORK_NAMES, CODE_FACTS, FOLLOWED_LAUNCHPAD_IDS, FOLLOWED_LAUNCHPADS, GLOSSARY_KEYS, KNOWLEDGE_KEYS } from "@/shared/bot/knowledge-facts";
import { KNOWLEDGE_GROUPS } from "@/shared/bot/knowledge-facts-groups";
import { fmt, LOCALES } from "@/shared/i18n/config";
import { DICTIONARIES, type Dictionary } from "@/shared/i18n/dictionaries";
import { en } from "@/shared/i18n/dictionaries/en";
import { FEE_BPS } from "@/shared/swap/server/config";
import { docsFigures, figureStrings } from "@/shared/tonk/figures";
import { MAINNET_RECORD } from "@/shared/tonk/mainnet-record";
import { mainnetNetwork } from "@/shared/tonk/networks";
import { ALERT_LAUNCHPADS } from "@/shared/types/live";
import { chainFees, sendsLegacy } from "@/shared/wallet/fees";

const pack = buildKnowledge();
const { core } = pack;
const RECORD = [MAINNET_RECORD.launchpad, MAINNET_RECORD.migrator, MAINNET_RECORD.guard, MAINNET_RECORD.tokenFactory, MAINNET_RECORD.safe];

/** The message at a dotted path, or undefined. */
function textAt(t: Dictionary, path: string): string | undefined {
  let node: unknown = t;
  for (const part of path.split(".")) node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  return typeof node === "string" ? node : undefined;
}

/** Every message under a part of the dictionary. */
const messages = (node: object): string[] => Object.values(node).flatMap((value) => (typeof value === "string" ? [value] : messages(value)));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("what the knowledge pack reads", () => {
  it.each(LOCALES.map((l) => l.code))("finds every path, with text, in %s", (code) => {
    for (const path of [...KNOWLEDGE_KEYS, ...GLOSSARY_KEYS]) expect(textAt(DICTIONARIES[code], path)?.trim(), `${code} ${path}`).toBeTruthy();
  });

  it("takes no demo, mock, hero or marketing copy, and nothing the page blocks already hold", () => {
    const demo = ["token.", "hero.", "pick.", "native.", "scope.", "heating.", "later.", "live.", "notFound."];
    for (const path of KNOWLEDGE_KEYS) expect([...demo, "docs.", "security.", "privacy."].some((prefix) => path.startsWith(prefix)), path).toBe(false);
    for (const path of GLOSSARY_KEYS) expect(demo.some((prefix) => path.startsWith(prefix)), path).toBe(false);
    const copy = [en.hero, en.pick, en.native, en.scope, en.heating, en.token.agent, en.token.tele, en.token.crew, en.token.insights].flatMap(messages);
    expect(copy.filter((text) => text.length >= 20 && core.includes(text))).toEqual([]);
    expect(core).not.toMatch(/\bdemo\b|\bmock\b/i);
  });
});

describe("the English core", () => {
  it("runs in the Docs page's order, then Security, privacy, the features, the contracts and the code's facts", () => {
    const tags = [...core.matchAll(/^\[([\w.]+)\]/gm)].map((match) => match[1]);
    expect(tags).toEqual(["docs", ...KNOWLEDGE_SECTIONS.map((id) => `docs.${id}`), "security", "privacy", ...KNOWLEDGE_GROUPS.map((g) => `features.${g.id}`), "contracts", "facts"]);
  });

  it("names the figures the page reads live, never their values", () => {
    const f = en.docs.figures;
    for (const label of [f.fee, f.reserves, f.startCap, f.graduation, f.status, f.reserveNow, f.maxCurve]) expect(core).toContain(label);
    const figures = docsFigures({ chainId: 4663, launchFee: "5000000000000000", virtualEth: "1000000000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: null, readAt: 0 });
    if (!figures) throw new Error("no figures");
    const shown = figureStrings(figures, 3000, "ETH");
    for (const value of [shown.launchFee, shown.startReserves, shown.startCap, shown.graduation, shown.graduationCap, ...Object.values(shown.usd ?? {})]) expect(core).not.toContain(value);
    for (const line of [en.docs.figures.demo, en.docs.figures.none, en.docs.figures.loading, en.docs.figures.unavailable]) expect(core).not.toContain(line);
  });

  it("states no ETH or dollar amount but the owner's bounds: a launch fee up to 0.05 ETH, a reserve between 1 and 100 ETH", () => {
    const amounts = [...core.matchAll(/\d[\d,.]*\s?(?:test\s)?ETH\b/g)].map((match) => match[0]);
    expect(new Set(amounts)).toEqual(new Set(["0.05 ETH", "100 ETH"]));
    expect(core).toContain("(up to 0.05 ETH)");
    expect(core).toContain("between 1 and 100 ETH");
    expect(core).not.toMatch(/\$\s?\d|≈/);
  });

  it("leaves out what only a site says: invite-only launches, the testnet and the privacy page's date", () => {
    for (const line of [en.docs.launching.invite, en.docs.safety.invite, en.docs.testnetNote]) expect(core).not.toContain(line);
    expect(core).not.toContain("Last updated");
    expect(core).not.toMatch(/\{\w+\}/);
  });

  it("fills the privacy page's names as the page does, the operator only inside its sentence", () => {
    expect(core).toContain(fmt(en.privacy.subtitle, { bot: "TonkFun", handle: "@TonkfunBot" }));
    expect(core).toContain(fmt(en.privacy.rights.who, { operator: en.privacy.rights.team }));
    expect(core.split("\n")).not.toContain(en.privacy.rights.team);
    expect(core).toContain(en.privacy.ai.retention);
    expect(core).toContain(en.privacy.never.dm);
  });

  it("says tokens can have images, as they have since 12 Nov", () => {
    expect(en.docs.launching.images).toMatch(/^A token can have an image: a PNG, JPEG, WebP or GIF up to 2 MB/);
    expect(core).toContain(en.docs.launching.images);
    expect(core).toContain(en.tokenImage.help);
    expect(core).not.toMatch(/images come later/i);
  });

  it("carries the wallet notes members ask about", () => {
    for (const line of [en.wallet.likelyToFail, en.mission.trade.notSent, en.launch.run.notSent, en.wallet.note]) expect(core).toContain(line);
  });

  it("lists the deployment record's five contracts with their Blockscout pages, and no other address", () => {
    expect(pack.addresses).toEqual(RECORD);
    for (const address of RECORD.slice(0, 4)) expect(core).toContain(`${address} · https://robinhoodchain.blockscout.com/address/${address}?tab=contract`);
    expect(core).toContain(`${MAINNET_RECORD.safe} · https://robinhoodchain.blockscout.com/address/${MAINNET_RECORD.safe}\n`);
    expect([...new Set(core.match(/0x[0-9a-fA-F]{40}/g))]).toEqual(RECORD);
  });

  it("stays well inside a model request", () => {
    expect(core.length).toBeLessThan(60_000);
    for (const { code } of LOCALES) expect(pack.glossary[code].length, code).toBeLessThan(8_000);
  });
});

describe("the code's facts", () => {
  it("states the swap fee FEE_BPS takes", () => {
    expect(FEE_BPS).toBe(100);
    expect(CODE_FACTS[0]).toContain(`pay tonkfun.fun a ${FEE_BPS / 100}% fee`);
    expect(core).toContain(CODE_FACTS[0]);
  });

  it("states the legacy transactions shared/wallet/fees.ts sends on Robinhood Chain mainnet", async () => {
    const mainnet = mainnetNetwork({ launchpad: MAINNET_RECORD.launchpad, migrator: MAINNET_RECORD.migrator, block: String(MAINNET_RECORD.block) });
    expect(mainnet && sendsLegacy(mainnet.chainId)).toBe(true);
    expect(sendsLegacy(46630)).toBe(false);
    expect(await chainFees(async () => ({ baseFeePerGas: "0x3b9aca00" }))).toEqual({ type: "0x0", gasPrice: "0x77359400" });
    const fact = CODE_FACTS[1];
    for (const words of ["On Robinhood Chain mainnet", "every transaction in the legacy format", "twice the latest base fee", "charges only the base fee"]) expect(fact).toContain(words);
    expect(core).toContain(fact);
  });

  it("names the Bridge's networks, as many as the Docs say", () => {
    expect(en.docs.about.bridge).toContain(`between ${BRIDGE_NETWORK_NAMES.length} networks`);
    expect(CODE_FACTS[2]).toMatch(new RegExp(`^Bridge moves major assets between ${BRIDGE_NETWORK_NAMES.length} networks: `));
    for (const name of BRIDGE_NETWORK_NAMES) expect(CODE_FACTS[2]).toContain(name);
  });

  it("names the launchpads the worker follows", () => {
    expect(FOLLOWED_LAUNCHPADS).toEqual(["tonkfun.fun", "Pons", "Pump.fun", "Bonk.fun"]);
    expect([...FOLLOWED_LAUNCHPAD_IDS].sort()).toEqual([...ALERT_LAUNCHPADS].sort());
    expect(CODE_FACTS[3]).toContain("from tonkfun.fun, Pons, Pump.fun and Bonk.fun:");
    expect(core).toContain(CODE_FACTS[3]);
  });
});

describe("the glossaries", () => {
  it.each(LOCALES.map((l) => l.code))("give %s's own words for the site's terms", (code) => {
    const glossary = pack.glossary[code];
    for (const path of GLOSSARY_KEYS) expect(glossary, `${code} ${path}`).toContain(textAt(DICTIONARIES[code], path));
    if (code !== "en") expect(glossary).toContain(`${en.docs.fees.title} = ${DICTIONARIES[code].docs.fees.title}`);
    expect(glossary).not.toMatch(/\{\w+\}/);
  });
});

describe("the pack's hash", () => {
  it("is the sha256 of the pack without it, and the same on every build", () => {
    const { hash, ...body } = pack;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash("sha256").update(JSON.stringify(body)).digest("hex")).toBe(hash);
    expect(buildKnowledge()).toEqual(pack);
  });

  it("reads no environment: another site's settings build the same pack", async () => {
    vi.stubEnv("NEXT_PUBLIC_TONK_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_TONK_LAUNCHPAD", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("NEXT_PUBLIC_TONK_MIGRATOR", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK", "5");
    vi.stubEnv("NEXT_PUBLIC_TONK_LAUNCH_INVITES", "0x3333333333333333333333333333333333333333");
    vi.stubEnv("NEXT_PUBLIC_SECURITY_CONTACT", "security@example.com");
    vi.resetModules();
    const fresh = await import("@/shared/bot/knowledge");
    expect(fresh.buildKnowledge()).toEqual(pack);
  });
});

describe("what the bot knows, for review", () => {
  it("matches the English snapshot: any change to it shows here", () => {
    expect(core).toMatchSnapshot();
    expect(pack.glossary.en).toMatchSnapshot();
  });
});
