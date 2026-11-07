import type { TrackedToken } from "../model";
import { EARLY_BUYERS } from "../pons/holders";
import { fetchTopHolders } from "../sources/holders";
import type { TokenStore } from "../store";
import type { SmartWallets } from "./wallets";

/**
 * Smart money, once a minute. A Solana graduate's largest wallets are read
 * soon after it graduates (2 Helius credits); a Pons graduate's first buyers
 * are already known from its curve. Six hours later the graduate credits
 * those wallets, but only if it held up: bundles that push a token to
 * graduation and dump it right after would otherwise pass as smart money.
 * Then every token counts the smart wallets it holds.
 */
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Solana graduates looked up per minute (about 100 graduate a day). */
export const GRADUATE_CHECKS_PER_MINUTE = 2;
/** Largest wallets a Solana token keeps for its smart money count. */
export const TOP_WALLETS = 20;
/** A graduate credits its wallets this long after graduating... */
export const HELD_FOR = 6 * HOUR;
/** ...if it is still worth half its value at graduation, and at least this much. */
export const HELD_SHARE = 0.5;
export const HELD_MIN_CAP = 10_000;

/** Market cap when the token graduated: the last point at or before then, else the first after. */
export function capAtGraduation(token: TrackedToken): number | null {
  const at = token.graduatedAt;
  if (at === null || token.mcapSeries.length === 0) return null;
  let cap: number | null = null;
  for (const [time, value] of token.mcapSeries) {
    if (time > at) return cap ?? value;
    cap = value;
  }
  return cap;
}

/** Whether a graduate kept its value, so its wallets earn credit. */
export function heldUp(token: TrackedToken): boolean {
  if (token.marketAt === 0 || token.marketCap < HELD_MIN_CAP) return false;
  const atGraduation = capAtGraduation(token);
  return atGraduation === null || token.marketCap >= HELD_SHARE * atGraduation;
}

const sinceGraduation = (t: TrackedToken, now: number) => (t.graduated && t.graduatedAt !== null ? now - t.graduatedAt : null);

/** Solana graduates of the last six hours whose largest wallets haven't been read yet, the latest first. */
export function snapshotsDue(tokens: readonly TrackedToken[], smart: SmartWallets, now: number): TrackedToken[] {
  return tokens
    .filter((t) => {
      const age = sinceGraduation(t, now);
      return !t.pons && age !== null && age < HELD_FOR && !t.graduationWallets && !smart.hasGraduate(t.address);
    })
    .sort((a, b) => (b.graduatedAt ?? 0) - (a.graduatedAt ?? 0));
}

/** Graduates six hours to a day old whose wallets haven't been credited yet. */
export function creditsDue(tokens: readonly TrackedToken[], smart: SmartWallets, now: number): TrackedToken[] {
  return tokens.filter((t) => {
    const age = sinceGraduation(t, now);
    return age !== null && age >= HELD_FOR && age <= DAY && !smart.hasGraduate(t.address);
  });
}

/** The wallets a graduate credits: none if it didn't hold up. One more than credited, since credit() leaves the creator out. */
export function creditedWallets(token: TrackedToken): string[] {
  if (!heldUp(token)) return [];
  const wallets = token.pons ? (token.pons.earlyBuyers ?? []) : (token.graduationWallets ?? []);
  return wallets.slice(0, EARLY_BUYERS + 1);
}

/**
 * The wallets a token's count looks at: every wallet on a Pons curve, or the
 * largest wallets otherwise (Helius on Solana, Blockscout for graduated Pons).
 */
export function walletsOf(token: TrackedToken): readonly string[] {
  if (token.pons && !token.graduated) return Object.keys(token.pons.balances ?? {});
  return token.topWallets ?? [];
}

interface SmartDeps {
  store: TokenStore;
  smart: SmartWallets;
  heliusApiKey: string | null;
  onHeliusCall: () => void;
  fail: (scope: string, error: unknown) => void;
}

export function createSmartMoney(deps: SmartDeps) {
  async function sweep(now = Date.now()): Promise<void> {
    const due = deps.heliusApiKey ? snapshotsDue(deps.store.all(), deps.smart, now).slice(0, GRADUATE_CHECKS_PER_MINUTE) : [];
    for (const token of due) {
      try {
        const check = await fetchTopHolders(deps.heliusApiKey ?? "", token.address, token.supply ?? null, deps.onHeliusCall);
        token.graduationWallets = check.wallets.slice(0, EARLY_BUYERS + 1);
        token.topWallets = check.wallets.slice(0, TOP_WALLETS);
      } catch (error) {
        deps.fail("smart", error);
        // Skipped rather than retried every minute at the credit budget's expense.
        token.graduationWallets = [];
      }
    }
    for (const token of creditsDue(deps.store.all(), deps.smart, now)) {
      const graduate = { chain: token.chain, creator: token.creator, at: token.graduatedAt ?? now };
      deps.smart.credit(token.address, graduate, creditedWallets(token));
    }
    deps.smart.refresh(now);
    for (const token of deps.store.all()) token.smartCount = deps.smart.count(walletsOf(token));
  }

  return { sweep };
}
