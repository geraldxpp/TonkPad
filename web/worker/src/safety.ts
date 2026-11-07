import { ISSUERS } from "./issuers";
import type { TrackedToken } from "./model";
import { JUDGED_FROM } from "./score";
import { fetchTopHolders } from "./sources/holders";
import { fetchHolderCounts, fetchJupiterVouch, JUPITER_BATCH } from "./sources/jupiter";
import type { TokenStore } from "./store";

/**
 * Facts gathered a few tokens at a time so they fit the free plans: Jupiter's
 * word on issuer claims and its holder counts, and the top-10 holder share of
 * Solana tokens on screen worth $20K+ (Helius).
 */
const MINUTE = 60_000;
/** A token on screen has its top-10 share measured again after this long. */
export const HOLDERS_EVERY = 30 * MINUTE;
/** Holder checks per minute: 2 Helius credits each, so at most ~0.26M credits a month. */
export const HOLDER_CHECKS_PER_MINUTE = 3;
/** Jupiter is asked again this long after it declined an issuer claim. */
export const ISSUER_RECHECK_EVERY = 6 * 60 * MINUTE;
/** Holder counts: tokens on screen refresh this often, other listed tokens less often. */
export const COUNT_VISIBLE_EVERY = 2 * MINUTE;
export const COUNT_LISTED_EVERY = 20 * MINUTE;
/** Tokens worth less than this aren't listed in Trending or Gainers, so their counts wait until they're on screen. */
const COUNT_LISTED_FROM = 4_000;

/** Solana tokens whose holder count is stale: those on screen first (oldest count first), then listed ones by market cap. */
export function holderCountsDue(tokens: readonly TrackedToken[], visible: ReadonlySet<string>, limit: number, now: number): TrackedToken[] {
  const age = (t: TrackedToken) => now - (t.holderCountAt ?? 0);
  const sol = tokens.filter((t) => t.chain === "sol");
  const onScreen = sol.filter((t) => visible.has(t.address) && age(t) >= COUNT_VISIBLE_EVERY).sort((a, b) => age(b) - age(a));
  const listed = sol
    .filter((t) => !visible.has(t.address) && t.marketAt > 0 && t.marketCap >= COUNT_LISTED_FROM && age(t) >= COUNT_LISTED_EVERY)
    .sort((a, b) => b.marketCap - a.marketCap);
  return [...onScreen, ...listed].slice(0, limit);
}

/** Solana tokens on screen worth $20K+ whose top-10 share is missing or stale: never-measured first, then the oldest. */
export function holdersDue(tokens: readonly TrackedToken[], visible: ReadonlySet<string>, limit: number, now: number): TrackedToken[] {
  return tokens
    .filter(
      (t) =>
        t.chain === "sol" &&
        visible.has(t.address) &&
        t.marketCap >= JUDGED_FROM &&
        !t.issuer &&
        now - (t.holdersAt ?? 0) >= HOLDERS_EVERY,
    )
    .sort((a, b) => (a.holdersAt ?? 0) - (b.holdersAt ?? 0) || b.marketCap - a.marketCap)
    .slice(0, limit);
}

/** Tokens carrying an issuer's authorities that Jupiter hasn't confirmed yet (or not lately). */
export function issuerChecksDue(tokens: readonly TrackedToken[], limit: number, now: number): TrackedToken[] {
  return tokens
    .filter((t) => t.issuerClaim && !t.issuer && now - (t.issuerCheckedAt ?? 0) >= ISSUER_RECHECK_EVERY)
    .slice(0, limit);
}

interface SafetyDeps {
  store: TokenStore;
  visible: () => ReadonlySet<string>;
  heliusApiKey: string | null;
  jupiterApiKey: string | null;
  /** Runs once per Helius call (1 credit each here). */
  onHeliusCall: () => void;
  fail: (scope: string, error: unknown) => void;
}

export function createSafetyChecks(deps: SafetyDeps) {
  /** Confirms issuer claims with Jupiter; a failed request is retried the next minute. */
  async function verifyIssuers(): Promise<void> {
    if (!deps.jupiterApiKey) return;
    for (const token of issuerChecksDue(deps.store.all(), 5, Date.now())) {
      const claim = token.issuerClaim;
      if (!claim) continue;
      try {
        const vouched = await fetchJupiterVouch(deps.jupiterApiKey, token.address, ISSUERS[claim].jupiterTag);
        token.issuer = vouched ? claim : null;
        token.issuerCheckedAt = Date.now();
      } catch (error) {
        deps.fail("jupiter", error);
      }
    }
  }

  /** Measures top-10 holder shares; a failed check waits for the next round rather than spend credits again now. */
  async function refreshHolders(): Promise<void> {
    if (!deps.heliusApiKey) return;
    for (const token of holdersDue(deps.store.all(), deps.visible(), HOLDER_CHECKS_PER_MINUTE, Date.now())) {
      try {
        const check = await fetchTopHolders(deps.heliusApiKey, token.address, token.supply ?? null, deps.onHeliusCall);
        token.top10Share = check.share;
        if (check.supply !== null) token.supply = check.supply;
      } catch (error) {
        deps.fail("holders", error);
      }
      token.holdersAt = Date.now();
    }
  }

  /** One Jupiter request for up to 100 holder counts; a token Jupiter hasn't indexed keeps its last count. */
  async function refreshHolderCounts(): Promise<void> {
    if (!deps.jupiterApiKey) return;
    const due = holderCountsDue(deps.store.all(), deps.visible(), JUPITER_BATCH, Date.now());
    if (due.length === 0) return;
    try {
      const counts = await fetchHolderCounts(deps.jupiterApiKey, due.map((t) => t.address));
      const at = Date.now();
      for (const token of due) {
        token.holderCount = counts.get(token.address) ?? token.holderCount ?? null;
        token.holderCountAt = at;
      }
    } catch (error) {
      deps.fail("jupiter", error);
    }
  }

  return { verifyIssuers, refreshHolders, refreshHolderCounts };
}
