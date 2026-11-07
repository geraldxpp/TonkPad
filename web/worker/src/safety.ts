import { ISSUERS } from "./issuers";
import type { TrackedToken } from "./model";
import { JUDGED_FROM } from "./score";
import { fetchTopHolders } from "./sources/holders";
import { fetchJupiterVouch } from "./sources/jupiter";
import type { TokenStore } from "./store";

/**
 * Mission score v2's extra facts, gathered a few tokens a minute so they fit
 * Helius's free plan: Jupiter's word on issuer claims, and the top-10 holder
 * share of Solana tokens on screen worth $20K+.
 */
const MINUTE = 60_000;
/** A token on screen has its top-10 share measured again after this long. */
export const HOLDERS_EVERY = 30 * MINUTE;
/** Holder checks per minute: 2 Helius credits each, so at most ~0.26M credits a month. */
export const HOLDER_CHECKS_PER_MINUTE = 3;
/** Jupiter is asked again this long after it declined an issuer claim. */
export const ISSUER_RECHECK_EVERY = 6 * 60 * MINUTE;

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

  return { verifyIssuers, refreshHolders };
}
