import type { ChainId } from "@/shared/types/chain";

/**
 * Smart money v1 (approved by the owner on 7 Nov 2026): wallets that keep
 * getting in early on tokens that graduate. Each graduation credits the
 * wallets it names, never its creator's: on Pons its first buyers, on Solana
 * its largest wallets at graduation (a stand-in for early buying, since Solana
 * trade data costs money). A wallet is smart money once graduates from at
 * least 3 different creators credited it within 30 days. A manual list of
 * wallets to add or drop comes later.
 */
const DAY = 24 * 60 * 60_000;
export const SMART_WINDOW = 30 * DAY;
/** Different creators whose graduates must have credited a wallet. */
export const SMART_MIN_CREATORS = 3;

export interface Graduate {
  chain: ChainId;
  creator: string;
  /** When it graduated, ms. */
  at: number;
}

/** What the snapshot keeps: graduates by token, and the graduates that credited each wallet. */
export interface SmartWalletsJSON {
  graduates: Record<string, Graduate>;
  credits: Record<string, string[]>;
}

export class SmartWallets {
  private readonly graduates = new Map<string, Graduate>();
  private readonly credits = new Map<string, string[]>();
  private smart = new Set<string>();

  /** Wallets credited at least once, graduates credited, and wallets that count as smart money. */
  stats(): { wallets: number; graduates: number; smart: number } {
    return { wallets: this.credits.size, graduates: this.graduates.size, smart: this.smart.size };
  }

  hasGraduate(token: string): boolean {
    return this.graduates.has(token);
  }

  /** Credits each wallet, except the creator, for a graduate; false when it was credited before. */
  credit(token: string, graduate: Graduate, wallets: readonly string[]): boolean {
    if (this.graduates.has(token)) return false;
    this.graduates.set(token, graduate);
    for (const wallet of new Set(wallets)) {
      if (wallet === graduate.creator) continue;
      const tokens = this.credits.get(wallet);
      if (tokens) tokens.push(token);
      else this.credits.set(wallet, [token]);
    }
    return true;
  }

  /** Forgets graduates older than 30 days, and works out who is smart money now. */
  refresh(now: number): void {
    for (const [token, graduate] of this.graduates) if (now - graduate.at > SMART_WINDOW) this.graduates.delete(token);
    const smart = new Set<string>();
    for (const [wallet, tokens] of this.credits) {
      const kept = tokens.filter((token) => this.graduates.has(token));
      if (kept.length === 0) {
        this.credits.delete(wallet);
        continue;
      }
      if (kept.length < tokens.length) this.credits.set(wallet, kept);
      const creators = new Set(kept.map((token) => this.graduates.get(token)?.creator));
      if (creators.size >= SMART_MIN_CREATORS) smart.add(wallet);
    }
    this.smart = smart;
  }

  /** How many of `wallets` are smart money. */
  count(wallets: Iterable<string>): number {
    let n = 0;
    for (const wallet of wallets) if (this.smart.has(wallet)) n += 1;
    return n;
  }

  toJSON(): SmartWalletsJSON {
    return { graduates: Object.fromEntries(this.graduates), credits: Object.fromEntries(this.credits) };
  }

  /** Replaces everything with a snapshot's contents, skipping anything malformed. */
  restore(raw: unknown, now: number): void {
    this.graduates.clear();
    this.credits.clear();
    const json = (raw ?? {}) as Partial<SmartWalletsJSON>;
    for (const [token, g] of Object.entries(json.graduates ?? {})) {
      if (g && typeof g.creator === "string" && typeof g.at === "number" && (g.chain === "sol" || g.chain === "rh")) {
        this.graduates.set(token, { chain: g.chain, creator: g.creator, at: g.at });
      }
    }
    for (const [wallet, tokens] of Object.entries(json.credits ?? {})) {
      if (Array.isArray(tokens)) this.credits.set(wallet, tokens.filter((t): t is string => typeof t === "string"));
    }
    this.refresh(now);
  }
}
