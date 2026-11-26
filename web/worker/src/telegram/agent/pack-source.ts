import { buildKnowledge, type Knowledge } from "@/shared/bot/knowledge";
import { MAINNET_RECORD } from "@/shared/tonk/mainnet-record";
import type { Fetch } from "../../alerts/deliver";
import { readSiteFacts } from "./pack-source-site";
import type { Pack, PackSource, SiteFacts } from "./types";

/** How often the site's facts are read: at start, then every 30 minutes. */
export const SITE_REFRESH_MS = 30 * 60_000;
/** A read due within this counts as due, so a caller's own 30-minute timer, firing a little early, never skips one. */
const SLACK_MS = 5_000;
/** How much of a hash health() shows: enough for a person to compare. */
const PREFIX = 8;

/**
 * The deployment record's five addresses, always from the worker's own
 * checkout: with this turn's tool results, the only addresses an answer may show.
 */
const RECORD_ADDRESSES: readonly string[] = [MAINNET_RECORD.launchpad, MAINNET_RECORD.migrator, MAINNET_RECORD.guard, MAINNET_RECORD.tokenFactory, MAINNET_RECORD.safe];

export interface PackSourceOptions {
  /** The site's origin, as the bot links it: "https://www.tonkfun.fun". */
  site: string;
  fetchFn?: Fetch;
  log: (line: string) => void;
  now: () => number;
  /** The site's knowledge differs from the worker's: called once per site hash, after two reads in a row agree. */
  onStale: (siteHash: string) => void;
  /** Builds the pack: buildKnowledge, unless a test passes its own. */
  build?: () => Knowledge;
}

/**
 * The knowledge pack the answers read (prompts/15-community-agent.md, "What
 * it knows"). The pack itself is built here, from the worker's own checkout,
 * and never comes over the network. The site adds only its facts: its pack's
 * hash, whether Launch is invite-only and the Security page's contact, read
 * through refresh() and kept while later reads fail.
 *
 * refresh(now) reads the site when a read is due (the first call, then
 * every 30 minutes) and otherwise returns at once, so the caller awaits it
 * at start, before the setup check reads contact(), and may call it on any
 * tick. It never rejects.
 *
 * A site hash that differs from the worker's is reported once, on the second
 * read in a row that sees it: a site and a worker deployed together differ
 * for a few minutes, and only a difference that lasts means the worker is
 * behind.
 */
export function createPackSource(options: PackSourceOptions): PackSource {
  const { site, log, now, onStale } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const local = (options.build ?? buildKnowledge)();
  let pack: Pack = { core: local.core, glossary: local.glossary, hash: local.hash, addresses: RECORD_ADDRESSES, site: null };
  let nextAt = Number.NEGATIVE_INFINITY;
  let reading: Promise<void> | null = null;
  let failures = 0;
  let lastError: string | null = null;
  /** A differing site hash seen once, waiting for the next read to confirm it. */
  let seen: string | null = null;
  const reported = new Set<string>();

  const compare = (facts: SiteFacts) => {
    if (facts.hash === local.hash) {
      seen = null;
      return;
    }
    if (reported.has(facts.hash)) return;
    if (seen !== facts.hash) {
      seen = facts.hash;
      log(`knowledge: the site's pack ${facts.hash.slice(0, PREFIX)} differs from the worker's ${local.hash.slice(0, PREFIX)}`);
      return;
    }
    reported.add(facts.hash);
    try {
      onStale(facts.hash);
    } catch (error) {
      log(`knowledge: the stale-pack alert failed (${error instanceof Error ? error.name : "error"})`);
    }
  };

  const read = async () => {
    const result = await readSiteFacts(site, fetchFn, now).catch(() => "network" as const);
    if (typeof result === "string") {
      failures += 1;
      lastError = result;
      log(`knowledge: site facts not read (${result}); ${pack.site ? "keeping the last good ones" : "none yet"}`);
      return;
    }
    failures = 0;
    lastError = null;
    pack = { ...pack, site: result };
    compare(result);
  };

  const contact = (): ReturnType<PackSource["contact"]> => (pack.site === null ? "unknown" : pack.site.contact ? "set" : "none");

  return {
    current: () => pack,
    refresh(time) {
      if (reading) return reading;
      if (!Number.isFinite(time) || time < nextAt - SLACK_MS) return Promise.resolve();
      nextAt = time + SITE_REFRESH_MS;
      reading = read()
        .catch(() => undefined)
        .finally(() => {
          reading = null;
        });
      return reading;
    },
    contact,
    health: () => ({
      local: local.hash.slice(0, PREFIX),
      site: pack.site ? pack.site.hash.slice(0, PREFIX) : null,
      // Unknown until the site has answered: only a real difference reads as stale.
      match: pack.site ? pack.site.hash === local.hash : null,
      contact: contact(),
      inviteOnly: pack.site ? pack.site.inviteOnly : null,
      coreSize: local.core.length,
      fetchedAt: pack.site ? pack.site.readAt : null,
      failures,
      error: lastError,
    }),
  };
}
