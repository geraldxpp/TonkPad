"use client";

import { ArrowUpRight } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { useSlippage } from "@/shared/swap/slippage";
import { formatEth, formatTokens, parseEthInput } from "@/shared/tonk/format";
import type { MissionJson, TradeSide } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { chargedCrewBps, quoteTrade } from "@/shared/tonk/quote";
import { storedReferrer } from "@/shared/tonk/referral";
import { wallet } from "@/shared/wallet/wallet";
import { useCurveRun } from "../../hooks/useCurveRun";
import { useLaunchpadSettings } from "../../hooks/useLaunchpadSettings";
import type { AccountView } from "../../hooks/useMissionAccount";
import type { SentTrade } from "../../hooks/useSentTrade";
import { tradeForm } from "../../lib/curve-form";
import { bpsPct } from "../../lib/curve-text";
import { CoinPill } from "../trade/CoinPill";
import { TradeBox } from "../trade/TradeBox";
import { TradeCard } from "../trade/TradeCard";
import { SideAndOrder } from "../trade/TradeControls";
import { CurveReview } from "./CurveReview";
import { CurveStatus } from "./CurveStatus";
import { SlippagePicker } from "./SlippagePicker";

const ZERO = BigInt(0);
const BIG = "font-mono text-[30px] leading-9 font-medium tracking-[-0.045em] max-md:text-[28px]";
const PRESET = "h-[30px] min-w-0 flex-1 truncate rounded-md border px-1 font-mono text-[11px] font-medium";

export interface CurveTradePanelProps {
  mission: MissionJson;
  network: TonkNetwork;
  view: AccountView;
  /** The trade in flight or just settled, watched by the page. */
  sent: SentTrade | null;
  /** The wallet sent a trade: the page watches its hash from here. */
  onSent: (hash: string) => void;
  onDismiss: () => void;
  /** The server read newer state while checking a trade: the page takes it at once. */
  onMission: (mission: MissionJson) => void;
  initialSide?: TradeSide;
  /** In the phone sheet. */
  onClose?: () => void;
}

/**
 * Buy and Sell on a mission's curve. The quote is the contract's own maths
 * on the page's latest read; the review has the server check and simulate
 * the exact call, and only then is the wallet asked. Buys are typed in the
 * coin, sells in tokens.
 */
export function CurveTradePanel({ mission, network, view, sent, onSent, onDismiss, onMission, initialSide = "buy", onClose }: CurveTradePanelProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const m = t.mission.trade;
  const id = useId();
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [text, setText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [slippageBps, setSlippage] = useSlippage();
  const settings = useLaunchpadSettings();
  const { owner, account } = view;
  const unit = network.unit;
  const ticker = mission.symbol;
  const buy = side === "buy";

  // Sent: the review closes (and the phone sheet with it); the page shows the trade confirming.
  const sentNow = useCallback(
    (hash: string) => {
      setReviewing(false);
      setText("");
      onSent(hash);
      onClose?.();
    },
    [onSent, onClose],
  );
  const { state: run, start, reset } = useCurveRun({ onMission, onSent: sentNow });

  const amount = parseEthInput(text);
  const quote = amount !== null && amount > ZERO ? quoteTrade(mission, side, amount, slippageBps) : null;
  const { presets, balance, short, cta } = tradeForm({ t, mission, side, unit, owner, account, failed: view.failed, amount, quoted: quote !== null, waiting: sent?.waiting === true, settings });
  const onCta = async () => {
    if (owner) return setReviewing(true);
    setConnecting(true);
    await wallet.connect("rh");
    setConnecting(false);
  };
  const confirm = () => {
    if (!owner || !quote) return;
    void start({ token: mission.token, trader: owner, side, amount: quote.amountIn, minOut: quote.minOut, referrer: storedReferrer(window.localStorage, network.chainId, owner) });
  };
  const crew = chargedCrewBps(mission);
  const fees = { protocol: bpsPct(100), crew: bpsPct(crew), creator: bpsPct(mission.creatorBps) };
  const pick = (next: TradeSide) => {
    setSide(next);
    setText("");
  };
  return (
    <TradeCard name={mission.name} onClose={onClose}>
      <SideAndOrder side={side} onSide={pick} chain="rh" />
      {sent ? <CurveStatus sent={sent} token={mission.token} ticker={ticker} network={network} onDismiss={onDismiss} /> : null}
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
            {quote ? <span>{fmt(m.minLine, { amount: buy ? `${formatTokens(BigInt(quote.minOut))} ${ticker}` : `${formatEth(BigInt(quote.minOut))} ${unit}`, pct: bpsPct(slippageBps) })}</span> : null}
          </>
        }
      >
        <span className="min-w-0 truncate font-mono text-[22px] leading-8 font-medium tracking-[-0.04em]">{quote ? (buy ? formatTokens(BigInt(quote.out)) : formatEth(BigInt(quote.out))) : "0"}</span>
        {buy ? <CoinPill kind="token" art="" ticker={ticker} label={ticker} /> : <CoinPill kind="chain" chain="rh" label={unit} />}
      </TradeBox>
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
      {short && buy && network.faucetUrl ? (
        <a href={network.faucetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-center rounded text-[12px] font-semibold text-accent-text">
          {t.launch.action.faucet}
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
        </a>
      ) : null}
      <span className="text-center text-[11px] leading-[1.6] text-text-3">{fmt(crew > 0 || mission.crewBps === 0 ? m.feeLine : m.feeLineWaived, fees)}</span>
      <CurveReview
        open={reviewing}
        onClose={() => {
          setReviewing(false);
          reset();
        }}
        mission={mission}
        network={network}
        quote={quote}
        needsApproval={!buy && account !== null && quote !== null && BigInt(account.allowance) < BigInt(quote.amountIn)}
        referrer={owner ? storedReferrer(typeof window === "undefined" ? { getItem: () => null } : window.localStorage, network.chainId, owner) : null}
        run={run}
        onConfirm={confirm}
      />
    </TradeCard>
  );
}
