"use client";

import { useCallback, useId, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { useSlippage } from "@/shared/swap/slippage";
import { formatEth, formatTokens, parseEthInput } from "@/shared/tonk/format";
import type { MissionJson, TradeSide } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import type { PoolQuoteJson } from "@/shared/tonk/pool";
import { wallet } from "@/shared/wallet/wallet";
import { useLaunchpadSettings } from "../../hooks/useLaunchpadSettings";
import type { AccountView } from "../../hooks/useMissionAccount";
import { usePoolQuote } from "../../hooks/usePoolQuote";
import { usePoolRun } from "../../hooks/usePoolRun";
import type { SentTrade } from "../../hooks/useSentTrade";
import { tradeForm } from "../../lib/curve-form";
import { bpsPct, runError } from "../../lib/curve-text";
import { CoinPill } from "../trade/CoinPill";
import { TradeBox } from "../trade/TradeBox";
import { TradeCard } from "../trade/TradeCard";
import { SideAndOrder } from "../trade/TradeControls";
import { CurveStatus } from "./CurveStatus";
import { PoolReview } from "./PoolReview";
import { SlippagePicker } from "./SlippagePicker";

const ZERO = BigInt(0);
const BPS = BigInt(10_000);
const BIG = "font-mono text-[30px] leading-9 font-medium tracking-[-0.045em] max-md:text-[28px]";
const PRESET = "h-[30px] min-w-0 flex-1 truncate rounded-md border px-1 font-mono text-[11px] font-medium";

export interface PoolTradePanelProps {
  mission: MissionJson;
  network: TonkNetwork;
  view: AccountView;
  sent: SentTrade | null;
  onSent: (hash: string) => void;
  onDismiss: () => void;
  initialSide?: TradeSide;
  onClose?: () => void;
}

/**
 * Buy and Sell once a mission has graduated: on its Uniswap v4 pool, through
 * Uniswap's official router. The quote is Uniswap's own V4Quoter; the review
 * has the server check and run the exact swap at one block, and only then is
 * the wallet asked. Buys are typed in the coin, sells in tokens.
 */
export function PoolTradePanel({ mission, network, view, sent, onSent, onDismiss, initialSide = "buy", onClose }: PoolTradePanelProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const m = t.mission.trade;
  const id = useId();
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [text, setText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  // The quote as the review opened on it: what the review shows and confirm sends, never changed by a refresh unseen.
  const [frozen, setFrozen] = useState<PoolQuoteJson | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [slippageBps, setSlippage] = useSlippage();
  const settings = useLaunchpadSettings();
  const { owner, account } = view;
  const unit = network.unit;
  const ticker = mission.symbol;
  const buy = side === "buy";

  const sentNow = useCallback(
    (hash: string) => {
      setReviewing(false);
      setFrozen(null);
      setText("");
      onSent(hash);
      onClose?.();
    },
    [onSent, onClose],
  );
  const { state: run, start, reset } = usePoolRun(sentNow);

  const amount = parseEthInput(text);
  const { quote, error } = usePoolQuote(mission.token, side, amount !== null && amount > ZERO ? amount : null);
  const minOf = (basis: PoolQuoteJson | null) => (basis ? (BigInt(basis.out) * (BPS - BigInt(slippageBps))) / BPS : null);
  const minOut = minOf(quote);
  // Only the server's "moved" brings a fresher quote into the review, with its notice.
  const reviewed = run.moved ?? frozen ?? quote;
  const reviewMin = minOf(reviewed);
  const quoted = quote !== null && BigInt(quote.out) > ZERO;
  const { presets, balance, short, cta } = tradeForm({ t, mission, side, unit, owner, account, failed: view.failed, amount, quoted, waiting: sent?.waiting === true, settings, pool: true });
  const onCta = async () => {
    if (owner) {
      setFrozen(quote);
      return setReviewing(true);
    }
    setConnecting(true);
    await wallet.connect("rh");
    setConnecting(false);
  };
  const confirm = () => {
    if (!owner || !reviewed || reviewMin === null) return;
    void start({ token: mission.token, trader: owner, side: reviewed.side, amount: reviewed.amountIn, minOut: String(reviewMin) });
  };
  const pick = (next: TradeSide) => {
    setSide(next);
    setText("");
  };
  const feeBps = quote?.feeBps ?? 100 + mission.crewBps + mission.creatorBps;
  return (
    <TradeCard name={mission.name} onClose={onClose}>
      <SideAndOrder side={side} onSide={pick} chain="rh" />
      {sent ? <CurveStatus sent={sent} token={mission.token} ticker={ticker} network={network} pool={mission.pool ?? quote?.pool ?? null} onDismiss={onDismiss} /> : null}
      <TradeBox
        top={
          <>
            <label htmlFor={id}>{buy ? tr.pay : tr.sellAmount}</label>
            <span className={cn(short && "text-neg")}>{balance}</span>
          </>
        }
      >
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={amount === null ? true : undefined}
          className={`${BIG} w-full min-w-0 flex-auto bg-transparent text-text outline-none placeholder:text-text-3`}
        />
        {buy ? <CoinPill kind="chain" chain="rh" label={unit} /> : <CoinPill kind="token" art="" ticker={ticker} label={ticker} />}
      </TradeBox>
      <div role="group" aria-label={tr.presets} className="flex gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={text === preset.value}
            onClick={() => setText(preset.value)}
            className={cn(PRESET, text === preset.value ? "border-accent/45 bg-accent/8 text-accent-text" : "border-line bg-raised text-text-2 hover:text-accent-text")}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <TradeBox
        tone="receive"
        top={
          <>
            <span>{tr.receive}</span>
            {quote && minOut !== null ? <span>{fmt(m.minLine, { amount: buy ? `${formatTokens(minOut)} ${ticker}` : `${formatEth(minOut)} ${unit}`, pct: bpsPct(slippageBps) })}</span> : null}
          </>
        }
      >
        <span className="min-w-0 truncate font-mono text-[22px] leading-8 font-medium tracking-[-0.04em]">{quote ? (buy ? formatTokens(BigInt(quote.out)) : formatEth(BigInt(quote.out))) : "0"}</span>
        {buy ? <CoinPill kind="token" art="" ticker={ticker} label={ticker} /> : <CoinPill kind="chain" chain="rh" label={unit} />}
      </TradeBox>
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-warn/25 bg-warn/7 px-3.5 py-2.5 text-[12px] leading-[1.6] text-warn">
          {runError(t, error, unit)}
        </p>
      ) : null}
      <SlippagePicker value={slippageBps} onChange={setSlippage} />
      <button
        type="button"
        aria-disabled={cta.disabled || connecting || undefined}
        onClick={cta.disabled || connecting ? undefined : () => void onCta()}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-semibold",
          cta.disabled || connecting ? "cursor-not-allowed border border-line-strong bg-input text-text-2" : "bg-cta text-on-cta shadow-cta hover:brightness-110",
        )}
      >
        {cta.label}
      </button>
      <span className="text-center text-[11px] leading-[1.6] text-text-3">{fmt(m.poolLine, { pct: bpsPct(feeBps) })}</span>
      <PoolReview
        open={reviewing}
        onClose={() => {
          setReviewing(false);
          setFrozen(null);
          reset();
        }}
        mission={mission}
        network={network}
        quote={frozen ?? quote}
        minOut={reviewMin}
        run={run}
        onConfirm={confirm}
      />
    </TradeCard>
  );
}
