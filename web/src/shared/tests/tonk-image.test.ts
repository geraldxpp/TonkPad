import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedImage, parseHiddenImages, parseImageHost, signedRecently, tokenImageHash, tokenImageUrl, uploadMessage, visibleImage } from "@/shared/tonk/image";
import { decodeMetadata, encodeMetadata, shownMetadata } from "@/shared/tonk/metadata";

const HOST = "abc123store.public.blob.vercel-storage.com";
const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);
const URL_OK = `https://${HOST}/token-art/${HASH}.webp`;
const LINKS = { description: "A pup.", x: "astropup", telegram: "", website: "" };

describe("the image host", () => {
  it("is one exact hostname: never a wildcard, a URL, a port or a path", () => {
    expect(parseImageHost(` ${HOST.toUpperCase()} `)).toBe(HOST);
    expect(parseImageHost("images.tonkfun.test")).toBe("images.tonkfun.test");
    for (const bad of [undefined, "", "*.public.blob.vercel-storage.com", `https://${HOST}`, `${HOST}:443`, `${HOST}/token-art`, "localhost", "evil.com@x.com"]) {
      expect(parseImageHost(bad), String(bad)).toBeNull();
    }
  });

  it("shows only our exact address: https, the host, token-art/<sha256>.webp, nothing more", () => {
    expect(tokenImageHash(URL_OK, HOST)).toBe(HASH);
    expect(allowedImage(URL_OK, HOST)).toBe(URL_OK);
    for (const bad of [
      `http://${HOST}/token-art/${HASH}.webp`,
      `https://other.public.blob.vercel-storage.com/token-art/${HASH}.webp`,
      `https://${HOST}.evil.com/token-art/${HASH}.webp`,
      `https://${HOST}/token-art/${HASH}.webp?x=1`,
      `https://${HOST}/token-art/${HASH}.png`,
      `https://${HOST}/elsewhere/${HASH}.webp`,
      `https://${HOST}/token-art/${HASH.toUpperCase()}.webp`,
      `https://user@${HOST}/token-art/${HASH}.webp`,
      `https://${HOST}:8443/token-art/${HASH}.webp`,
      "ipfs://bafy…",
      42,
    ]) {
      expect(allowedImage(bad, HOST), String(bad)).toBe("");
    }
    // Without a configured host, nothing is ever shown.
    expect(allowedImage(URL_OK, null)).toBe("");
  });

  it("drops a hidden image, given as a hash or as its link", () => {
    const hidden = parseHiddenImages(`${OTHER}, ${URL_OK.toUpperCase()}\n junk`);
    expect([...hidden].sort()).toEqual([HASH, OTHER]);
    expect(visibleImage(URL_OK, hidden, HOST)).toBe("");
    expect(visibleImage(tokenImageUrl("c".repeat(64), HOST), hidden, HOST)).toBe(tokenImageUrl("c".repeat(64), HOST));
    expect(parseHiddenImages(undefined).size).toBe(0);
  });
});

describe("an upload's signed message", () => {
  it("names the site, the wallet, the file's hash and the time, in the language's own words", () => {
    const claim = { site: "tonk-pad.vercel.app", wallet: "0xAbC0000000000000000000000000000000000001", hash: HASH, time: "2026-11-12T10:00:00.000Z" };
    const text = uploadMessage("Upload\nSite: {site}\nWallet: {wallet}\nImage: {hash}\nTime: {time}\n{other}", claim);
    expect(text).toBe(`Upload\nSite: tonk-pad.vercel.app\nWallet: ${claim.wallet}\nImage: ${HASH}\nTime: 2026-11-12T10:00:00.000Z\n{other}`);
  });

  it("counts for five minutes, and not from the future", () => {
    const now = Date.parse("2026-11-12T10:00:00.000Z");
    expect(signedRecently("2026-11-12T09:55:00.000Z", now)).toBe(true);
    expect(signedRecently("2026-11-12T09:54:59.999Z", now)).toBe(false);
    expect(signedRecently("2026-11-12T10:01:00.000Z", now)).toBe(true);
    expect(signedRecently("2026-11-12T10:01:00.001Z", now)).toBe(false);
    for (const bad of ["2026-11-12T10:00:00Z", "1731405600000", "yesterday", ""]) expect(signedRecently(bad, now), bad).toBe(false);
  });
});

describe("a mission's image in its metadata", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TONK_IMAGE_HOST", HOST));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips through encode and decode, keeping v: 1, and is optional", () => {
    const stored = encodeMetadata({ ...LINKS, image: URL_OK });
    expect(JSON.parse(stored)).toEqual({ v: 1, description: "A pup.", x: "astropup", image: URL_OK });
    expect(decodeMetadata(stored)).toEqual({ ...LINKS, image: URL_OK });
    // A mission without one is stored exactly as before.
    expect(encodeMetadata(LINKS)).toBe('{"v":1,"description":"A pup.","x":"astropup"}');
    expect(decodeMetadata(encodeMetadata(LINKS)).image).toBe("");
  });

  it("drops an image from another host, when it is written and when it is read", () => {
    const outside = "https://evil.example/token-art/x.webp";
    expect(encodeMetadata({ ...LINKS, image: outside })).not.toContain("evil");
    expect(decodeMetadata(JSON.stringify({ v: 1, image: outside })).image).toBe("");
    expect(decodeMetadata(JSON.stringify({ v: 1, image: `https://other.public.blob.vercel-storage.com/token-art/${HASH}.webp` })).image).toBe("");
    expect(decodeMetadata(JSON.stringify({ v: 1, image: { url: URL_OK } })).image).toBe("");
  });

  it("drops a hidden hash, and the server passes the metadata on without it", () => {
    const hidden = parseHiddenImages(HASH);
    const stored = JSON.stringify({ v: 1, description: "A pup.", image: URL_OK });
    expect(decodeMetadata(stored, hidden).image).toBe("");
    expect(JSON.parse(shownMetadata(stored, hidden))).toEqual({ v: 1, description: "A pup." });
    // Not hidden: kept. Outside: taken out. No image, or not JSON: passed on as it is.
    expect(shownMetadata(stored, new Set())).toBe(JSON.stringify({ v: 1, description: "A pup.", image: URL_OK }));
    expect(JSON.parse(shownMetadata(JSON.stringify({ v: 1, image: "https://evil.example/a.png" }), new Set()))).toEqual({ v: 1 });
    expect(shownMetadata('{"v":1,"x":"astropup"}', hidden)).toBe('{"v":1,"x":"astropup"}');
    expect(shownMetadata("ipfs://bafy", hidden)).toBe("ipfs://bafy");
  });
});
