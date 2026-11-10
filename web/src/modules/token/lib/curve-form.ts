import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ethInputText, formatEth, formatTokens } from "@/shared/tonk/format";
import type { MissionAccountJson, MissionJson, TradeSide } from "@/shared/tonk/mission";
import type { TonkSettingsJson } from "@/shared/tonk/types";

const ZERO = BigInt(0);
const WEI = BigInt(10) ** BigInt(18);
/** Max on a buy keeps back twice a trade's network fee: about 350,000 gas at the chain's price. */
const GAS_RESERVE = BigInt(700_000);
/** The chain's usual gas price, until the launchpad's settings have been read. */
const USUAL_GAS_PRICE = BigInt(100_000_000);

export interface TradeFormInput {
  t: Dictionary;
  mission: MissionJson;
  side: TradeSide;
  /** What a buy is paid in: "test ETH". */
  unit: string;
  owner: string | null;
  account: MissionAccountJson | null;
  /** The wallet's standing couldn't be read. */
  failed: boolean;
  /** The typed amount in wei; null when it isn't a number. */
  amount: bigint | null;
  quoted: boolean;
  /** An earlier trade is still waiting for its receipt. */
  waiting: boolean;
  settings: TonkSettingsJson | null;
}

export interface TradeForm {
  presets: { label: string; value: string }[];
  balance: string;
  /** The wallet holds less than the amount typed. */
  short: boolean;
  cta: { label: string; disabled: boolean };
}

/**
 * What the curve trade form offers and says for a wallet: the presets (the
 * launchpad's virtual reserve ÷ 60, 24 and 12 and Max for a buy; a quarter,
 * half, three quarters and Max of the tokens held for a sell), the balance
 * line, and the button, which names the first thing that is missing.
 */
export function tradeForm({ t, mission, side, unit, owner, account, failed, amount, quoted, waiting, settings }: TradeFormInput): TradeForm {
  const tr = t.token.trade;
  const m = t.mission.trade;
  const buy = side === "buy";
  const ticker = mission.symbol;
  const coin = account ? BigInt(account.eth) : null;
  const held = account ? BigInt(account.tokens) : null;
  const reserved = GAS_RESERVE * (settings?.gasPrice ? BigInt(settings.gasPrice) : USUAL_GAS_PRICE);
  const maxBuy = coin !== null && coin > reserved ? coin - reserved : ZERO;
  const reserve = settings ? BigInt(settings.virtualEth) : null;
  const presets = buy
    ? [...(reserve ? [60, 24, 12].map((part) => ethInputText(reserve / BigInt(part))) : []).map((value) => ({ label: value, value })), { label: tr.max, value: ethInputText(maxBuy) }]
    : [...[25, 50, 75].map((pct) => ({ label: `${pct}%`, value: held ? String((held * BigInt(pct)) / BigInt(100) / WEI) : "0" })), { label: tr.max, value: ethInputText(held ?? ZERO) }];
  const balance = !owner
    ? fmt(tr.balance, { amount: "—" })
    : !account
      ? failed
        ? tr.balanceFailed
        : tr.checking
      : fmt(tr.balance, { amount: buy ? `${formatEth(BigInt(account.eth))} ${unit}` : `${formatTokens(BigInt(account.tokens))} ${ticker}` });
  const short = buy ? coin !== null && amount !== null && amount > maxBuy : held !== null && amount !== null && amount > held;
  const stopped = (label: string) => ({ label, disabled: true });
  const cta = !owner
    ? { label: t.header.connectWallet, disabled: false }
    : mission.graduated
      ? stopped(m.graduated)
      : mission.paused
        ? stopped(m.paused)
        : buy && !mission.buyingOpen
          ? stopped(m.early)
          : !quoted
            ? stopped(tr.enter)
            : short
              ? stopped(buy ? fmt(m.shortCoin, { unit }) : fmt(tr.shortToken, { ticker }))
              : { label: buy ? m.reviewBuy : m.reviewSell, disabled: !account || waiting };
  return { presets, balance, short, cta };
}
