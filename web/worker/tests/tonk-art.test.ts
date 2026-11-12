// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeMetadata } from "@/shared/tonk/metadata";
import { parseSnapshot } from "../src/snapshot";
import { TokenStore } from "../src/store";
import { FEED_EVENTS } from "../src/tonk/abi";
import { TonkBook } from "../src/tonk/book";
import { CONFIRMATIONS, TonkFeed } from "../src/tonk/feed";
import { toToken } from "../src/tokens";
import { listView } from "../src/views/list";
import { NOW } from "./fixtures";
import { LAUNCHPAD } from "./tonk-chain";
import { CONFIG, FakeRpc, SYSTEM } from "./tonk-rpc";
import { MARKS, TOKEN, tonkScenario } from "./tonk-scenario";

const HOST = "abc123store.public.blob.vercel-storage.com";
const imageOf = (digit: string) => `https://${HOST}/token-art/${digit.repeat(64)}.webp`;
const metadata = (image: string) => encodeMetadata({ description: "", x: "", telegram: "", website: "", image }) || JSON.stringify({ v: 1, image });

/** Follows the scenario's launch, stored with `launchImage`, and an edit to `edited` part-way through. */
async function follow(launchImage: string, edited?: string, store = new TokenStore()) {
  const chain = tonkScenario({ metadataUri: JSON.stringify({ v: 1, image: launchImage }) });
  if (edited !== undefined) chain.emit(LAUNCHPAD, FEED_EVENTS, "MetadataUpdated", { token: chain.token, newMetadataUri: metadata(edited), newAgentPrompt: chain.agentPrompt }, MARKS.traded, chain.nextTx());
  const rpc = new FakeRpc(chain);
  const feed = new TonkFeed(rpc, CONFIG, new TonkBook(store, SYSTEM));
  for (let i = 0; i < 40 && (feed.cursor ?? 0) < rpc.head - CONFIRMATIONS; i++) await feed.poll().catch(() => undefined);
  return { store, art: () => toToken(store.get(TOKEN)!, NOW).art };
}

describe("a launch's art in the worker's feed", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TONK_IMAGE_HOST", HOST));
  afterEach(() => vi.unstubAllEnvs());

  it("is the image in its metadata, from the image host only", async () => {
    expect((await follow(imageOf("a"))).art()).toBe(imageOf("a"));
    // Anywhere else is ignored: the token shows its letter.
    for (const outside of ["https://evil.example/token-art/x.webp", `https://other.public.blob.vercel-storage.com/token-art/${"a".repeat(64)}.webp`, `http://${HOST}/token-art/${"a".repeat(64)}.webp`]) {
      expect((await follow(outside)).art(), outside).toBe("");
    }
  });

  it("follows the creator's edits, and passes the art into Explore's lists", async () => {
    const { store, art } = await follow(imageOf("a"), imageOf("b"));
    expect(art()).toBe(imageOf("b"));
    const rows = (["trending", "new", "graduating", "graduated"] as const).flatMap((tab) => listView(store.all(), { chain: "all", pad: "all", tab, tf: "24h", q: "", limit: 50 }, NOW).rows);
    expect(rows.find((row) => row.address === TOKEN)?.art).toBe(imageOf("b"));
    expect((await follow(imageOf("a"), "")).art()).toBe("");
  });

  it("drops a hidden hash, also from a token saved before it was hidden", async () => {
    vi.stubEnv("TONK_HIDDEN_IMAGES", "b".repeat(64));
    expect((await follow(imageOf("b"))).art()).toBe("");
    expect((await follow(imageOf("a"))).art()).toBe(imageOf("a"));

    const saved = parseSnapshot(JSON.stringify({ tokens: (await follow(imageOf("a"))).store.toJSON(), ponsBlock: null, tonk: null }));
    vi.stubEnv("TONK_HIDDEN_IMAGES", `${"b".repeat(64)} ${imageOf("a")}`);
    const restored = new TokenStore();
    restored.restore(saved.tokens, NOW);
    expect(toToken(restored.get(TOKEN)!, NOW).art).toBe("");
  });
});
