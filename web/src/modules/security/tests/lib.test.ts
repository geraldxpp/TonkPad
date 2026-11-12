import { afterEach, describe, expect, it, vi } from "vitest";
import { parseContact, securityContact } from "../lib/contact";
import { FROZEN_AT, FROZEN_SOURCES } from "../lib/frozen-build";
import { bountyRewards, parseAmount, SEVERITIES } from "../lib/rewards";
import { scopeAddresses } from "../lib/scope";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security contact", () => {
  it("is coming soon while unset or blank", () => {
    expect(parseContact(undefined)).toBeNull();
    expect(parseContact("")).toBeNull();
    expect(parseContact("   ")).toBeNull();
  });

  it("takes an email address, with or without mailto:", () => {
    expect(parseContact(" security@tonkfun.fun ")).toEqual({ kind: "email", text: "security@tonkfun.fun", href: "mailto:security@tonkfun.fun" });
    expect(parseContact("MAILTO:bugs+launchpad@example.co.uk")).toEqual({ kind: "email", text: "bugs+launchpad@example.co.uk", href: "mailto:bugs+launchpad@example.co.uk" });
  });

  it("takes an https link and shows it without the scheme", () => {
    expect(parseContact("https://example.com/security")).toEqual({ kind: "link", text: "example.com/security", href: "https://example.com/security" });
    expect(parseContact("https://example.com")).toEqual({ kind: "link", text: "example.com", href: "https://example.com/" });
    expect(parseContact("https://forms.example.org/r?id=7#top")?.text).toBe("forms.example.org/r?id=7#top");
  });

  it("refuses anything else rather than link it", () => {
    for (const value of [
      "http://example.com/security",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:pass@example.com/",
      "https://localhost/report",
      "example.com/security",
      "security@",
      "mailto:someone@example.com?subject=bug",
      "a?subject=x@example.com",
      "a#b@example.com",
      `https://example.com/${"a".repeat(200)}`,
    ]) {
      expect(parseContact(value), value).toBeNull();
    }
  });

  it("reads NEXT_PUBLIC_SECURITY_CONTACT", () => {
    vi.stubEnv("NEXT_PUBLIC_SECURITY_CONTACT", "security@example.com");
    expect(securityContact()?.href).toBe("mailto:security@example.com");
    vi.stubEnv("NEXT_PUBLIC_SECURITY_CONTACT", "");
    expect(securityContact()).toBeNull();
  });
});

describe("rewards", () => {
  it("keeps the owner's amount as written, on one line", () => {
    expect(parseAmount("$25,000")).toBe("$25,000");
    expect(parseAmount("  5   ETH \n")).toBe("5 ETH");
  });

  it("counts blank or overlong values as unset", () => {
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("x".repeat(41))).toBeNull();
  });

  it("reads the four NEXT_PUBLIC_BOUNTY_ values, and makes none up", () => {
    for (const level of SEVERITIES) vi.stubEnv(`NEXT_PUBLIC_BOUNTY_${level.toUpperCase()}`, "");
    expect(bountyRewards()).toEqual({ critical: null, high: null, medium: null, low: null });
    vi.stubEnv("NEXT_PUBLIC_BOUNTY_CRITICAL", "$50,000");
    vi.stubEnv("NEXT_PUBLIC_BOUNTY_HIGH", "$10,000");
    vi.stubEnv("NEXT_PUBLIC_BOUNTY_MEDIUM", "$2,500");
    vi.stubEnv("NEXT_PUBLIC_BOUNTY_LOW", "$500");
    expect(bountyRewards()).toEqual({ critical: "$50,000", high: "$10,000", medium: "$2,500", low: "$500" });
  });
});

describe("scope addresses", () => {
  const deployment = {
    launchpad: "0x7A4C000000000000000000000000000000000001",
    migrator: "0x7a4c000000000000000000000000000000000002",
    block: "151000000",
  };

  it("shows mainnet's deployment, lowercase and linked to Blockscout", () => {
    expect(scopeAddresses("mainnet", deployment)).toEqual({
      state: "deployed",
      launchpad: { address: "0x7a4c000000000000000000000000000000000001", url: "https://robinhoodchain.blockscout.com/address/0x7a4c000000000000000000000000000000000001" },
      migrator: { address: "0x7a4c000000000000000000000000000000000002", url: "https://robinhoodchain.blockscout.com/address/0x7a4c000000000000000000000000000000000002" },
    });
  });

  it("is not deployed yet while mainnet's values are missing or malformed", () => {
    expect(scopeAddresses("mainnet", { launchpad: undefined, migrator: undefined, block: undefined })).toEqual({ state: "pending" });
    expect(scopeAddresses("mainnet", { ...deployment, migrator: "0x123" })).toEqual({ state: "pending" });
    expect(scopeAddresses("mainnet", { ...deployment, block: "" })).toEqual({ state: "pending" });
  });

  it("never shows the same values as mainnet's outside mainnet mode", () => {
    expect(scopeAddresses("off", deployment)).toEqual({ state: "pending" });
    expect(scopeAddresses("mock", deployment)).toEqual({ state: "pending" });
    // A testnet preview names its own deployment through these values: they are testnet contracts.
    expect(scopeAddresses("testnet", deployment)).toEqual({ state: "elsewhere" });
  });
});

describe("frozen build", () => {
  it("lists the three in-scope files with a SHA-256 each", () => {
    expect(FROZEN_SOURCES.map((source) => [source.id, source.file])).toEqual([
      ["launchpad", "src/TonkpadRobinhood.sol"],
      ["migrator", "src/TonkpadUniV4Migrator.sol"],
      ["guard", "src/TonkPoolInitializationGuard.sol"],
    ]);
    for (const source of FROZEN_SOURCES) expect(source.sha256, source.file).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(FROZEN_SOURCES.map((source) => source.sha256)).size).toBe(3);
    expect(FROZEN_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
