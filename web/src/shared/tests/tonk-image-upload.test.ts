// @vitest-environment node
// The upload route's checks on real files (made with sharp) and real signatures (viem), into the in-memory store.
import sharp from "sharp";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tonk/image/route";
import { de } from "@/shared/i18n/dictionaries/de";
import { en } from "@/shared/i18n/dictionaries/en";
import { parseHiddenImages, uploadMessage } from "@/shared/tonk/image";
import { TonkError } from "@/shared/tonk/server/client";
import { sha256 } from "@/shared/tonk/server/image-encode";
import { blobAuth, memoryStore } from "@/shared/tonk/server/image-store";
import { type UploadContext, uploadImage } from "@/shared/tonk/server/image-upload";

const HOST = "abc123store.public.blob.vercel-storage.com";
const SITE = "tonk-pad.vercel.app";
const NOW = Date.parse("2026-11-12T10:00:00.000Z");
const TIME = new Date(NOW - 60_000).toISOString();
const creator = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

const solid = (width: number, height: number, rgb: [number, number, number]) =>
  sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } });
const png = (width = 64, height = 64) => solid(width, height, [200, 40, 40]).png().toBuffer();

interface Upload {
  bytes: Uint8Array;
  type?: string;
  signer?: typeof creator;
  wallet?: string;
  /** What the signature covers, where it differs from what is sent. */
  signed?: Partial<{ site: string; hash: string; time: string; template: string }>;
  time?: string;
  lang?: string;
  signature?: string | null;
}

async function form({ bytes, type = "image/png", signer = creator, wallet = signer.address, signed = {}, time = TIME, lang = "en", signature }: Upload): Promise<FormData> {
  const message = uploadMessage(signed.template ?? en.tokenImage.message, { site: signed.site ?? SITE, wallet, hash: signed.hash ?? sha256(bytes), time: signed.time ?? time });
  const body = new FormData();
  body.set("file", new File([Buffer.from(bytes)], "art", { type }));
  body.set("wallet", wallet);
  body.set("time", time);
  body.set("lang", lang);
  const signing = signature === undefined ? await signer.signMessage({ message }) : signature;
  if (signing !== null) body.set("signature", signing);
  return body;
}

function context(overrides: Partial<UploadContext> = {}) {
  const store = memoryStore(HOST);
  return { store, ctx: { store, host: HOST, site: SITE, invites: null, hidden: new Set<string>(), now: NOW, ...overrides } satisfies UploadContext };
}

/** The code an upload was refused with. */
async function refusal(upload: Promise<unknown>): Promise<string> {
  const error = await upload.then(() => null, (reason: unknown) => reason);
  return error instanceof TonkError ? `${error.code} ${error.status}` : String(error);
}

describe("uploading a token image", () => {
  it("re-encodes to a 512 × 512 WebP with no metadata, named by its own hash", async () => {
    const { store, ctx } = context();
    const marked = await solid(900, 700, [40, 120, 220]).withExif({ IFD0: { Copyright: "secret", Artist: "someone" } }).withIccProfile("p3").jpeg().toBuffer();
    expect((await sharp(marked).metadata()).exif).toBeDefined();
    const { url, hash } = await uploadImage(await form({ bytes: marked, type: "image/jpeg" }), ctx);
    expect(url).toBe(`https://${HOST}/token-art/${hash}.webp`);
    const stored = store.stored.get(hash)!;
    expect(sha256(stored)).toBe(hash);
    const meta = await sharp(stored).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect([meta.exif, meta.icc, meta.xmp, meta.iptc]).toEqual([undefined, undefined, undefined, undefined]);
    // The same image gets the same address.
    expect((await uploadImage(await form({ bytes: marked, type: "image/jpeg" }), ctx)).url).toBe(url);
  });

  it("crops to the centre square, and keeps an animated GIF's first frame", async () => {
    const { store, ctx } = context();
    // Red | green | blue, side by side: the centre square is all green.
    const stripes = Buffer.alloc(300 * 100 * 3);
    for (let i = 0; i < 300 * 100; i += 1) stripes[i * 3 + Math.floor((i % 300) / 100)] = 255;
    const wide = await sharp(stripes, { raw: { width: 300, height: 100, channels: 3 } }).png().toBuffer();
    const cropped = await uploadImage(await form({ bytes: wide }), ctx);
    const pixel = async (hash: string, x: number) => {
      const { data, info } = await sharp(store.stored.get(hash)!).raw().toBuffer({ resolveWithObject: true });
      const at = (256 * info.width + x) * info.channels;
      return [data[at], data[at + 1], data[at + 2]];
    };
    for (const x of [8, 256, 503]) expect((await pixel(cropped.hash, x))[1], `x ${x}`).toBeGreaterThan(200);

    const frames = await Promise.all([solid(40, 40, [255, 0, 0]).png().toBuffer(), solid(40, 40, [0, 0, 255]).png().toBuffer()]);
    const gif = await sharp(frames, { join: { animated: true } }).gif().toBuffer();
    expect((await sharp(gif).metadata()).pages).toBe(2);
    const still = await uploadImage(await form({ bytes: gif, type: "image/gif" }), ctx);
    expect((await sharp(store.stored.get(still.hash)!).metadata()).pages ?? 1).toBe(1);
    const [red, , blue] = await pixel(still.hash, 256);
    expect(red).toBeGreaterThan(200);
    expect(blue).toBeLessThan(60);
  });

  it("takes PNG, JPEG, WebP or GIF up to 2 MB, and stores nothing that doesn't decode", async () => {
    const { store, ctx } = context();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await refusal(uploadImage(await form({ bytes: svg, type: "image/svg+xml" }), ctx))).toBe("type 415");
    expect(await refusal(uploadImage(await form({ bytes: new Uint8Array(2 * 1024 * 1024 + 1) }), ctx))).toBe("size 413");
    // Declared a PNG: an SVG, a PNG's first bytes then junk, a WebP calling itself PNG-typed but not decoding.
    const junk = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
    for (const bytes of [svg, junk, Buffer.from("RIFF0000WEBPjunk")]) expect(await refusal(uploadImage(await form({ bytes }), ctx))).toBe("unreadable 422");
    expect(store.stored.size).toBe(0);
    // A WebP is fine whatever its name said.
    const webp = await solid(80, 80, [1, 2, 3]).webp().toBuffer();
    await expect(uploadImage(await form({ bytes: webp, type: "image/webp" }), ctx)).resolves.toMatchObject({ hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("needs the uploader's own signature over this site, this file and a recent time", async () => {
    const { store, ctx } = context();
    const bytes = await png();
    expect(await refusal(uploadImage(await form({ bytes, signature: null }), ctx))).toBe("invalid 400");
    expect(await refusal(uploadImage(await form({ bytes, signature: `0x${"12".repeat(65)}` }), ctx))).toBe("signature 401");
    // Signed by someone else, for another image, for another site, or replayed later.
    expect(await refusal(uploadImage(await form({ bytes, signer: stranger, wallet: creator.address }), ctx))).toBe("signature 401");
    expect(await refusal(uploadImage(await form({ bytes, signed: { hash: sha256(await png(65, 65)) } }), ctx))).toBe("signature 401");
    expect(await refusal(uploadImage(await form({ bytes, signed: { site: "evil.example" } }), ctx))).toBe("signature 401");
    expect(await refusal(uploadImage(await form({ bytes, signed: { time: new Date(NOW).toISOString() } }), ctx))).toBe("signature 401");
    expect(await refusal(uploadImage(await form({ bytes, time: new Date(NOW - 5 * 60_000 - 1).toISOString() }), ctx))).toBe("expired 401");
    // The message is read in the language it was signed in.
    expect(await refusal(uploadImage(await form({ bytes, signed: { template: de.tokenImage.message } }), ctx))).toBe("signature 401");
    await expect(uploadImage(await form({ bytes, lang: "de", signed: { template: de.tokenImage.message } }), ctx)).resolves.toBeDefined();
    expect(store.stored.size).toBe(1);
  });

  it("lets only invited wallets upload while Launch is invite-only", async () => {
    const bytes = await png();
    const { ctx } = context({ invites: new Set([stranger.address.toLowerCase()]) });
    expect(await refusal(uploadImage(await form({ bytes }), ctx))).toBe("invite 403");
    await expect(uploadImage(await form({ bytes, signer: stranger }), ctx)).resolves.toBeDefined();
  });

  it("allows ten uploads per wallet an hour, counted before decoding", async () => {
    const { ctx } = context();
    const bytes = await png();
    for (let i = 0; i < 9; i += 1) await uploadImage(await form({ bytes }), ctx);
    // A file that doesn't decode still counts.
    expect(await refusal(uploadImage(await form({ bytes: Buffer.from("GIF89a-not-really") , type: "image/gif" }), ctx))).toBe("unreadable 422");
    expect(await refusal(uploadImage(await form({ bytes }), ctx))).toBe("limit 429");
    // Another wallet has its own ten; an hour on, the first has its ten back.
    await expect(uploadImage(await form({ bytes, signer: stranger }), ctx)).resolves.toBeDefined();
    const later = NOW + 60 * 60_000 + 1;
    await expect(uploadImage(await form({ bytes, time: new Date(later).toISOString() }), { ...ctx, now: later })).resolves.toBeDefined();
  });

  it("refuses a hidden image, and a store that isn't on the image host", async () => {
    const bytes = await png();
    const { store, ctx } = context();
    const { hash } = await uploadImage(await form({ bytes }), ctx);
    const hidden = context({ hidden: parseHiddenImages(hash) });
    expect(await refusal(uploadImage(await form({ bytes }), hidden.ctx))).toBe("hidden 422");
    expect(hidden.store.stored.size).toBe(0);
    expect(await refusal(uploadImage(await form({ bytes }), { ...ctx, store: memoryStore("elsewhere.public.blob.vercel-storage.com") }))).toBe("closed 404");
    expect(store.stored.size).toBe(1);
  });
});

describe("blobAuth", () => {
  it("uses a read-write token where one is set, else the store Vercel connected, else nothing", () => {
    expect(blobAuth({ BLOB_READ_WRITE_TOKEN: " vercel_blob_rw_x ", BLOB_STORE_ID: "store_y" })).toEqual({ token: "vercel_blob_rw_x" });
    expect(blobAuth({ BLOB_READ_WRITE_TOKEN: " ", BLOB_STORE_ID: " store_y " })).toEqual({ storeId: "store_y" });
    expect(blobAuth({ BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "" })).toBeNull();
    expect(blobAuth({})).toBeNull();
  });
});

describe("POST /api/tonk/image", () => {
  afterEach(() => vi.unstubAllEnvs());
  const post = (body: BodyInit, headers: Record<string, string> = {}) => POST(new Request(`https://${SITE}/api/tonk/image`, { method: "POST", body, headers: { host: SITE, ...headers } }));

  it("is closed where Launch is off, without an image host, or without a store", async () => {
    const body = await form({ bytes: await png() });
    for (const env of [{ NEXT_PUBLIC_TONK_NETWORK: "", NEXT_PUBLIC_TONK_IMAGE_HOST: HOST }, { NEXT_PUBLIC_TONK_NETWORK: "mainnet", NEXT_PUBLIC_TONK_IMAGE_HOST: "*.public.blob.vercel-storage.com" }, { NEXT_PUBLIC_TONK_NETWORK: "mainnet", NEXT_PUBLIC_TONK_IMAGE_HOST: HOST, BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: " ", NEXT_PUBLIC_WALLET_STUB: "" }]) {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const res = await post(body);
      expect([res.status, await res.json()], JSON.stringify(env)).toEqual([404, { error: "closed" }]);
    }
  });

  it("uploads in the e2e builds into memory, and refuses an oversized body before reading it", async () => {
    vi.stubEnv("NEXT_PUBLIC_TONK_NETWORK", "mock");
    vi.stubEnv("NEXT_PUBLIC_TONK_IMAGE_HOST", HOST);
    vi.stubEnv("NEXT_PUBLIC_WALLET_STUB", "1");
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const res = await post(await form({ bytes: await png() }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: expect.stringMatching(new RegExp(`^https://${HOST}/token-art/[0-9a-f]{64}\\.webp$`)), hash: expect.any(String) });
      const big = await post("x", { "content-length": String(3 * 1024 * 1024) });
      expect([big.status, await big.json()]).toEqual([413, { error: "size" }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
