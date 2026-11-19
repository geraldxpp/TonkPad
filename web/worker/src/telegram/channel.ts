import type { Locale } from "@/shared/i18n/config";
import type { Token } from "@/shared/types/token";
import type { TonkToken } from "../tonk/launch";
import type { TonkEvent } from "../tonk/events";
import { graduationPost, launchPost, lockPost, milestonePost, shieldPost } from "./posts";
import { plainText } from "./text";
import { GROUP_GAP, type Sender } from "./sender";
import { type BotState, KEYS_MAX } from "./state";
import type { View } from "./types";

/** Only news this recent is posted, so a restart or a catch-up never posts old events as new. */
export const FRESH_MS = 15 * 60_000;
/** The feed counts as caught up within this many blocks of its target. */
export const CAUGHT_UP = 200;
/** Taxes are reported once none has come in for this long (the shield lasts two blocks). */
const TAX_SETTLE_MS = 20_000;
const DAY_MS = 86_400_000;
const KINDS = new Set<TonkEvent["kind"]>(["launched", "graduated", "lockChanged", "bundleTax"]);

/** Letters that pass for (or read as) t, o, n and k: Greek, Cyrillic ("Тонк" reads "Tonk"), small capitals and a zero. */
const LOOKALIKES: Record<string, string> = { τ: "t", т: "t", ᴛ: "t", ο: "o", о: "o", ᴏ: "o", "0": "o", ν: "n", η: "n", п: "n", н: "n", ɴ: "n", κ: "k", к: "k", ᴋ: "k" };
/** Ordinary words that start the same way. */
const COMMON_WORDS = /^(tonka|tonkatsu|tonkotsu|tonkin|tonks)$/;

/**
 * A name or ticker that claims to be tonkfun.fun's own: a word starting
 * "tonk" (TONK, TonkPad, tonkfun·fun, T̲O̲N̲K̲, ΤΟΝΚ, T0NK), but not STONKS
 * or Tonkatsu. Pass the text as the channel shows it (plainText), so a "$"
 * or ":" inside the word can't split it.
 */
export function claimsBrand(name: string, ticker: string): boolean {
  const folded = `${name} ${ticker}`
    .normalize("NFKD")
    .replace(/[\p{M}\p{Default_Ignorable_Code_Point}]/gu, "")
    .toLowerCase()
    .replace(/./gu, (c) => LOOKALIKES[c] ?? c);
  return folded.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith("tonk") && !COMMON_WORDS.test(word));
}

export interface ChannelDeps {
  sender: Sender;
  chatId: string;
  lang: Locale;
  site: string;
  /** tonkfun.fun's launches in the store, by address. */
  launch: (address: string) => TonkToken | null;
  launches: () => TonkToken[];
  card: (token: TonkToken) => Token;
  /** Creator wallets allowed to use the brand in a name (the owner's own coin); lower-cased. */
  brandCreators: ReadonlySet<string>;
  /** Token addresses the channel never posts (the owner's call); lower-cased. */
  skip: ReadonlySet<string>;
  state: BotState["channel"];
  persist: () => void;
  now: () => number;
  log: (line: string) => void;
}

const milestoneOf = (t: TonkToken) => (t.graduated ? 100 : t.curve >= 0.9 ? 90 : t.curve >= 0.5 ? 50 : 0);
const lastTradeAt = (t: TonkToken) => t.tonk.trades.at(-1)?.[0] ?? t.createdAt;

/**
 * The official channel: tonkfun.fun's launches, curve milestones, graduations,
 * extended locks and the Block-0 Shield's report, from the launchpad feed's
 * own events. Nothing posts until the feed has caught up; each post is made
 * once (its key is kept) and only for fresh news; sends are queued, never
 * awaited, so the feed never waits on Telegram.
 */
export class ChannelPoster {
  readonly stats: { posted: number; lastPostAt: number | null; skipped: number } = { posted: 0, lastPostAt: null, skipped: 0 };
  private armed = false;
  private buffer: Array<{ e: TonkEvent; at: number }> = [];
  private readonly taxes = new Map<string, { buys: number; wei: bigint; at: number }>();
  private seen: Set<string>;
  private readonly warned = new Set<string>();

  constructor(private readonly deps: ChannelDeps) {
    this.seen = new Set(deps.state.keys);
  }

  /** One window of the feed's events with their blocks' times (ms), kept until its poll ends. */
  onEvents(events: readonly TonkEvent[], timeOf: (block: number) => number): void {
    for (const e of events) if (KINDS.has(e.kind)) this.buffer.push({ e, at: timeOf(e.block) });
    if (this.buffer.length > 2_000) this.buffer.splice(0, this.buffer.length - 2_000);
  }

  /** After each poll of the feed: arms once caught up, then posts what is new and fresh. One bad event never stops the rest. */
  async afterPoll(lagBlocks: number): Promise<void> {
    const events = this.buffer.splice(0);
    if (!this.armed) {
      if (lagBlocks > CAUGHT_UP) {
        // Catching up: nothing is news, but a lock's new end is remembered, so a later claim isn't taken for an extension.
        for (const { e } of events) this.attempt(() => this.rememberLock(e));
        return;
      }
      this.arm();
    }
    const now = this.deps.now();
    for (const { e, at } of events) this.attempt(() => this.apply(e, at, now));
    this.attempt(() => this.milestones(now));
    this.attempt(() => this.flushTaxes(now));
  }

  private attempt(step: () => void): void {
    try {
      step();
    } catch (error) {
      this.deps.log(`channel: skipped an event (${error instanceof Error ? error.message.slice(0, 80) : "error"})`);
    }
  }

  private rememberLock(e: TonkEvent): void {
    const t = e.kind === "lockChanged" ? this.deps.launch(e.token) : null;
    if (!t) return;
    this.deps.state.lockEnds[t.address] = t.tonk.lock?.end ?? 0;
    this.deps.persist();
  }

  /** Remembers where every launch stands, so nothing already true is posted as news. */
  private arm(): void {
    const { state } = this.deps;
    for (const t of this.deps.launches()) {
      state.milestones[t.address] ??= milestoneOf(t);
      state.lockEnds[t.address] ??= t.tonk.lock?.end ?? 0;
    }
    this.armed = true;
    this.deps.persist();
  }

  private apply(e: TonkEvent, at: number, now: number): void {
    const t = "token" in e ? this.deps.launch(e.token) : null;
    if (!t) return;
    const { state, lang, site } = this.deps;
    switch (e.kind) {
      case "launched":
        state.milestones[t.address] ??= milestoneOf(t);
        state.lockEnds[t.address] ??= t.tonk.lock?.end ?? 0;
        if (now - t.createdAt <= FRESH_MS) this.post(`launch:${t.address}`, t, launchPost(this.deps.card(t), { lock: t.tonk.lock, crewBps: t.tonk.crewBps }, lang, site));
        return;
      case "graduated":
        state.milestones[t.address] = 100;
        if (now - (t.graduatedAt ?? 0) <= FRESH_MS) this.post(`grad:${t.address}`, t, graduationPost(this.deps.card(t), lang, site));
        return;
      case "lockChanged": {
        const end = t.tonk.lock?.end ?? 0;
        const before = state.lockEnds[t.address] ?? 0;
        state.lockEnds[t.address] = end;
        this.deps.persist();
        // Only a real lock (the Locked badge: 1%+ of supply), only fresh, and at most once in 24 hours per token.
        const last = state.lockPostedAt[t.address] ?? 0;
        if (before > 0 && end > before && now - at <= FRESH_MS && now - last >= DAY_MS && this.deps.card(t).flags.locked) {
          state.lockPostedAt[t.address] = now;
          this.post(`lock:${t.address}:${end}`, t, lockPost(this.deps.card(t), end, lang, site));
        }
        return;
      }
      case "bundleTax": {
        const taxed = this.taxes.get(t.address) ?? { buys: 0, wei: BigInt(0), at: now };
        this.taxes.set(t.address, { buys: taxed.buys + 1, wei: taxed.wei + e.penalty, at: now });
        return;
      }
      default:
    }
  }

  private milestones(now: number): void {
    const { state, lang, site } = this.deps;
    for (const t of this.deps.launches()) {
      const level = milestoneOf(t);
      const before = state.milestones[t.address];
      if (before === undefined) {
        state.milestones[t.address] = level;
        continue;
      }
      if (level <= before) continue;
      state.milestones[t.address] = level;
      if ((level === 50 || level === 90) && now - lastTradeAt(t) <= FRESH_MS) this.post(`m${level}:${t.address}`, t, milestonePost(this.deps.card(t), level, lang, site));
    }
  }

  private flushTaxes(now: number): void {
    for (const [address, taxed] of this.taxes) {
      if (now - taxed.at < TAX_SETTLE_MS) continue;
      this.taxes.delete(address);
      const t = this.deps.launch(address);
      if (t && now - t.createdAt <= FRESH_MS) {
        this.post(`shield:${address}`, t, shieldPost(this.deps.card(t), { buys: taxed.buys, eth: Number(taxed.wei) / 1e18 }, this.deps.lang, this.deps.site));
      }
    }
  }

  /** Whether the channel speaks about this token at all: never one on the skip list, nor one using the brand without the owner's say-so. */
  private allowed(t: TonkToken): boolean {
    const address = t.address.toLowerCase();
    if (this.deps.skip.has(address)) return false;
    if (claimsBrand(plainText(t.name, 40), plainText(t.symbol, 16)) && !this.deps.brandCreators.has(t.creator.toLowerCase())) {
      if (!this.warned.has(address)) {
        this.warned.add(address);
        this.deps.log(`channel: not posting ${address}, whose name uses the tonkfun.fun brand (TELEGRAM_BRAND_CREATORS)`);
      }
      return false;
    }
    return true;
  }

  private post(key: string, t: TonkToken, view: View | null): void {
    if (this.seen.has(key) || !view) return;
    const { state } = this.deps;
    this.seen.add(key);
    state.keys.push(key);
    if (state.keys.length > KEYS_MAX) {
      state.keys.splice(0, state.keys.length - KEYS_MAX);
      this.seen = new Set(state.keys);
    }
    this.deps.persist();
    if (!this.allowed(t)) {
      this.stats.skipped += 1;
      return;
    }
    void this.deps.sender
      .toChat(this.deps.chatId, GROUP_GAP, "sendMessage", { chat_id: this.deps.chatId, text: view.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: view.keyboard })
      .then((sent) => {
        if (sent === null) return;
        this.stats.posted += 1;
        this.stats.lastPostAt = this.deps.now();
      });
  }
}
