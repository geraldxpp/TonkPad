import type { Token } from "@/shared/types/token";
import type { MissionLockJson } from "@/shared/tonk/mission";
import { launchedToken, type TonkToken } from "../src/tonk/launch";
import type { BotContext, BotData, InlineArticle, Out, Target } from "../src/telegram/router";
import { Limiter } from "../src/telegram/limiter";
import type { TgChat, View } from "../src/telegram/types";
import { NOW } from "./fixtures";

export const SITE = "https://www.tonkfun.fun";
export const WHOA = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
export const SOL_MINT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
export const WALLET = "0x1111111111111111111111111111111111111111";

/** A token as Explore's rows carry it. */
export function token(overrides: Partial<Token> = {}): Token {
  return {
    address: WHOA,
    ticker: "WHOA",
    name: "Whoa the Tarsier",
    chain: "rh",
    launchpad: "tonk",
    curve: 0.41,
    score: 78,
    level: "Safe",
    spark: { seed: 1, drift: 0, vol: 0.1 },
    change24h: 12.4,
    volume24h: 1_200,
    holders: 37,
    smartWallets: 0,
    marketCap: 21_400,
    flags: { hot: false, og: false, isNew: false, locked: true, crew: "2%", agent: false },
    creator: "0xf5aa…fd81",
    ageMinutes: 7_200,
    art: "",
    shield: true,
    ...overrides,
  };
}

/** A tonkfun.fun launch as the store holds it, `ageMs` old. */
export function launch(address: string, options: { ageMs?: number; name?: string; lock?: MissionLockJson | null; crewBps?: number } = {}): TonkToken {
  const t = launchedToken(
    { kind: "launched", token: address as `0x${string}`, creator: "0xc0ffee0000000000000000000000000000000000", name: options.name ?? "Whoa the Tarsier", symbol: "WHOA", crewBps: options.crewBps ?? 200, creatorBps: 0, lockType: 1, block: 1, logIndex: 0, tx: "0xabc" },
    { time: Math.floor((NOW - (options.ageMs ?? 60_000)) / 1000), metadataUri: "", agentPrompt: "", virtualEth: BigInt(10) ** BigInt(18), virtualTokens: BigInt(1_073_000_000) * BigInt(10) ** BigInt(18) },
  );
  t.tonk.lock = options.lock ?? null;
  return t;
}

export interface Recorded {
  sent: Array<{ chat: TgChat; view: View; replyTo?: number }>;
  edits: Array<{ target: Target; view: View }>;
  answers: Array<{ id: string; text?: string }>;
  inline: Array<{ id: string; results: InlineArticle[]; help: string }>;
}

/** An Out that records what the bot would send. */
export function recorder(): { out: Out; got: Recorded } {
  const got: Recorded = { sent: [], edits: [], answers: [], inline: [] };
  const out: Out = {
    send: async (chat, view, replyTo) => void got.sent.push({ chat, view, replyTo }),
    edit: async (target, view) => void got.edits.push({ target, view }),
    answer: async (id, text) => {
      got.answers.push({ id, text });
      return !id.startsWith("old");
    },
    inline: async (id, results, help) => void got.inline.push({ id, results, help }),
  };
  return { out, got };
}

export function context(data: Partial<BotData> = {}, now = NOW): { ctx: BotContext; got: Recorded } {
  const { out, got } = recorder();
  const base: BotData = { ready: () => true, token: (a) => (a === WHOA ? token() : null), latest: (pad) => (pad === "tonk" ? [token()] : [token({ launchpad: pad, address: pad === "pump" ? SOL_MINT : WHOA, ticker: pad.toUpperCase(), name: `New on ${pad}` })]), trending: () => [token({ launchpad: "pump", chain: "sol", address: SOL_MINT, ticker: "PEPE", name: "Pepe" })] };
  return {
    ctx: {
      data: { ...base, ...data }, out, site: SITE, bot: () => "tonkfun_bot", inline: () => true, now: () => now,
      limiter: new Limiter(8, 10_000), inlineLimiter: new Limiter(20, 10_000), inlineAll: new Limiter(10, 1_000), pressAll: new Limiter(5, 1_000),
    },
    got,
  };
}

/** Every URL in a view's buttons. */
export const urls = (view: View) => view.keyboard?.inline_keyboard.flat().flatMap((b) => ("url" in b ? [b.url] : [])) ?? [];
/** Every callback in a view's buttons. */
export const callbacks = (view: View) => view.keyboard?.inline_keyboard.flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : [])) ?? [];
