// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ISSUERS, issuerByAuthorities } from "../src/issuers";
import { jupiterVouches } from "../src/sources/jupiter";

const { xstocks, ondo } = ISSUERS;

describe("issuerByAuthorities", () => {
  it("matches a token carrying both of an issuer's authorities", () => {
    expect(issuerByAuthorities(xstocks.mintAuthority, xstocks.freezeAuthority)).toBe("xstocks");
    expect(issuerByAuthorities(ondo.mintAuthority, ondo.freezeAuthority)).toBe("ondo");
  });

  it("needs both, from the same issuer", () => {
    expect(issuerByAuthorities(xstocks.mintAuthority, null)).toBeNull();
    expect(issuerByAuthorities(null, ondo.freezeAuthority)).toBeNull();
    expect(issuerByAuthorities(xstocks.mintAuthority, ondo.freezeAuthority)).toBeNull();
  });

  it("leaves MNST out: a Bonk.fun launch named after a stock, holding its own authorities", () => {
    expect(issuerByAuthorities("GRgn7aD3tqdL7aua5o1Evj8ri8SUoKvQw653h2UytP4y", "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a")).toBeNull();
  });
});

describe("jupiterVouches", () => {
  const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
  const COPY = "27cA5EVihCXiY1zqTfcuiTDM1fsNVT6tt4Jc8YCypump";
  const results = [
    { id: TSLAX, isVerified: true, tags: ["verified", "xstocks", "stocks", "rwa"] },
    { id: COPY, isVerified: false, tags: [] },
  ];

  it("needs the mint verified under the issuer's own tag", () => {
    expect(jupiterVouches(results, TSLAX, "xstocks")).toBe(true);
    expect(jupiterVouches(results, TSLAX, "ondo")).toBe(false);
    expect(jupiterVouches(results, COPY, "xstocks")).toBe(false);
    expect(jupiterVouches([{ id: TSLAX, isVerified: false, tags: ["xstocks"] }], TSLAX, "xstocks")).toBe(false);
  });

  it("copes with odd answers", () => {
    expect(jupiterVouches(null, TSLAX, "xstocks")).toBe(false);
    expect(jupiterVouches({ id: TSLAX }, TSLAX, "xstocks")).toBe(false);
    expect(jupiterVouches([null, { id: TSLAX, isVerified: true, tags: "xstocks" }], TSLAX, "xstocks")).toBe(false);
  });
});
