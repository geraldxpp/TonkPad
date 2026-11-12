import { HttpRpc } from "../alerts/rpc";
import type { Snapshot } from "../snapshot";
import type { TokenStore } from "../store";
import { TonkBook } from "./book";
import { type FeedEnv, loadTonkFeedConfig } from "./config";
import { TonkFeed } from "./feed";

/** What the worker holds on to: one poll, what the snapshot keeps, and the /health block. */
export interface TonkFeedHandle {
  /** Reads the chain, then prices every launch at the ETH price now; returns how many launches it found. A failed read throws after the pricing. */
  poll: (ethUsd: number | null) => Promise<number>;
  saved: () => NonNullable<Snapshot["tonk"]>;
  /** Carries on from a snapshot's cursor, only if it followed this same launchpad; otherwise its launches are dropped and read again. */
  restore: (saved: Snapshot["tonk"]) => void;
  health: () => Record<string, unknown>;
}

/** Drops every tonkfun.fun launch from the store: a snapshot's, when the feed is off. */
export function dropLaunches(store: TokenStore): void {
  for (const t of store.all()) if (t.tonk) store.remove(t.address);
}

/**
 * The tonkfun.fun feed, when the environment names the mainnet deployment
 * (see tonk/config.ts), or null and a line saying why it's off. It only
 * reads the chain: it holds no key and sends nothing.
 */
export function createTonkFeed(store: TokenStore, env: FeedEnv, logsRpcUrl: string, log: (line: string) => void): TonkFeedHandle | null {
  const { config, note } = loadTonkFeedConfig(env, logsRpcUrl);
  log(note);
  if (!config) return null;
  const book = new TonkBook(store, { launchpad: config.launchpad, migrator: config.migrator, poolManager: config.poolManager });
  const feed = new TonkFeed(new HttpRpc(config.rpcUrl), config, book, null, Date.now, log);
  return {
    async poll(ethUsd) {
      try {
        return (await feed.poll()).launches;
      } finally {
        book.refresh(Date.now(), ethUsd);
      }
    },
    saved: () => ({ launchpad: config.launchpad, cursor: feed.cursor }),
    restore(saved) {
      if (saved?.launchpad === config.launchpad) {
        feed.cursor = saved.cursor;
        book.reindex();
        return;
      }
      dropLaunches(store);
      book.reindex();
      feed.cursor = null;
    },
    health: () => ({ block: feed.cursor, lagBlocks: feed.lag, launches: book.size }),
  };
}
