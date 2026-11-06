// @vitest-environment node
import { describe, expect, it } from "vitest";
import { artUrl, cdnImage, ipfsLocation, launchpadArt, repointArt } from "../src/art";

const V0 = "QmbpT6T3zfMoJCZKwPB9ZwuifgQYryTrHR7K13ihyEpPsx";
const V1 = "bafkreihpad4ut67ah7sj2rn4zz7376z3qxup3hbpon6rbf66xnil66cztu";
const CDN = "https://cdn.helius-rpc.com/cdn-cgi/image/width=256,quality=80,format=auto/";

describe("ipfsLocation", () => {
  it("reads all three spellings of an IPFS link", () => {
    expect(ipfsLocation(`https://ipfs.io/ipfs/${V0}`)).toEqual({ cid: V0, path: "" });
    expect(ipfsLocation(`ipfs://${V1}/art.png`)).toEqual({ cid: V1, path: "/art.png" });
    expect(ipfsLocation(`https://${V1}.ipfs.dweb.link/?filename=a.png`)).toEqual({ cid: V1, path: "" });
  });

  it("ignores links that are not IPFS", () => {
    expect(ipfsLocation("https://images.pump.fun/coin-image/MintA")).toBeNull();
    expect(ipfsLocation("https://example.com/ipfs/not-a-cid")).toBeNull();
  });
});

describe("artUrl", () => {
  it("serves Pump.fun art from Pump.fun's own gateway, through the image CDN", () => {
    expect(artUrl(`https://ipfs.io/ipfs/${V0}`, "pump")).toBe(`${CDN}https://pump.mypinata.cloud/ipfs/${V0}`);
  });

  it("serves other IPFS art from the public Filebase gateway", () => {
    expect(artUrl(`https://ipfs.io/ipfs/${V1}`, "bonk")).toBe(`${CDN}https://ipfs.filebase.io/ipfs/${V1}`);
    // Bonk.fun tokens whose metadata already uses Pump.fun's gateway keep it.
    expect(artUrl(`https://pump.mypinata.cloud/ipfs/${V1}`, "bonk")).toBe(`${CDN}https://pump.mypinata.cloud/ipfs/${V1}`);
  });

  it("passes other web links through the CDN and drops anything else", () => {
    expect(artUrl("https://playquoit.fun/meta/rngr.png", "bonk")).toBe(cdnImage("https://playquoit.fun/meta/rngr.png"));
    expect(artUrl("data:image/png;base64,AAAA", "pump")).toBeNull();
  });

  it("falls back to Pump.fun's image service when the metadata has no art", () => {
    expect(launchpadArt("MintA", "pump")).toBe(`${CDN}https://images.pump.fun/coin-image/MintA`);
    expect(launchpadArt("MintA", "bonk")).toBeNull();
  });
});

describe("repointArt", () => {
  it("moves art saved by an older worker onto the working gateway", () => {
    expect(repointArt(`${CDN}https://ipfs.io/ipfs/${V0}`, "pump")).toBe(`${CDN}https://pump.mypinata.cloud/ipfs/${V0}`);
  });

  it("leaves current and empty art alone", () => {
    const current = `${CDN}https://pump.mypinata.cloud/ipfs/${V0}`;
    expect(repointArt(current, "pump")).toBe(current);
    expect(repointArt(null, "pump")).toBeNull();
  });
});
