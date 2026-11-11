"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { amountText, FEE_RESERVE, formatFull, presetAmount } from "@/shared/swap/amounts";
import type { QuoteRequest } from "@/shared/swap/api";
import { quoteView } from "@/shared/swap/display";
import { SwapReview } from "@/shared/swap/SwapReview";
import { sameAddress } from "@/shared/swap/tokens";
import { useQuote } from "@/shared/swap/useQuote";
import { useSwapRun } from "@/shared/swap/useSwapRun";
import type { SwapToken } from "@/shared/types/swap";
import { useWallet, wallet } from "@/shared/wallet/wallet";
import { useWalletBalances, type WalletBalancesView } from "@/shared/wallet/useWalletBalances";
import { SwapCard, SwapAssurance } from "./components/SwapCard";
import { actionState, SwapAction } from "./components/SwapAction";
import { SwapSide } from "./components/SwapSide";
import { TokenPicker } from "./components/TokenPicker";
import type { SwapData } from "./data/get-swap-data";
import { useSwapForm } from "./hooks/useSwapForm";

/** A token's balance in base units, from the wallet balances read for it. */
function rawBalance(token: SwapToken | null, view: WalletBalancesView): string | null {
  if (!token || !view.balances) return null;
  return token.native ? view.balances.native.raw : (view.balances.token?.amount.raw ?? "0");
}

/**
 * The Swap screen: the heading, the swap card (with Recent) beside the token
 * and route, the token picker and the review that runs the swap. On phones a
 * bar keeps the estimate and the button in reach once the card's own button
 * scrolls away.
 */
export function SwapScreen({ data }: { data: SwapData }) {
  const { t, href } = useI18n();
  const s = t.swap;
  const form = useSwapForm();
  const { accounts } = useWallet();
  const owner = accounts[form.chain] ?? null;
  const { from, to } = form;

  const request: QuoteRequest | null =
    from && to && form.raw ? { chain: form.chain, from: from.address, to: to.address, amount: form.raw, slippageBps: form.slippageBps, taker: owner } : null;
  const { quote, loading, error } = useQuote(request);
  const view = quote && from && to ? quoteView(quote, from, to) : null;

  const payView = useWalletBalances(form.chain, from && !from.native ? from.address : null);
  const receiveView = useWalletBalances(form.chain, to && !to.native ? to.address : null);
  const payRaw = rawBalance(from, payView);
  const receiveRaw = rawBalance(to, receiveView);

  const short = form.raw !== null && payRaw !== null && BigInt(form.raw) > BigInt(payRaw);
  const [connecting, setConnecting] = useState(false);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const { state: run, run: start, reset } = useSwapRun();
  const action = actionState(s, { chain: form.chain, owner, anyWallet: Object.keys(accounts).length > 0, from, raw: form.raw, balance: payRaw, quote, loading, error });

  const actionRef = useRef<HTMLDivElement>(null);
  const [actionInView, setActionInView] = useState(true);
  useEffect(() => {
    const target = actionRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setActionInView(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const connect = async () => {
    setConnecting(true);
    await wallet.connect(form.chain);
    setConnecting(false);
  };
  const preset = (pct: number) => {
    if (!from || payRaw === null) return;
    const raw = presetAmount(payRaw, pct, pct === 100 && from.native ? FEE_RESERVE[form.chain] : BigInt(0));
    form.setAmount(raw ? amountText(raw, from.decimals) : "0");
  };
  const confirm = () => {
    if (!request || !owner || !from || !to) return;
    void start({ ...request, taker: owner }, { from: { symbol: from.symbol, amount: form.amount }, to: { symbol: to.symbol, amount: view?.outCompact ?? "" } });
  };
  const closeReview = () => {
    setReviewing(false);
    if (run.step === "done") form.setAmount("");
    reset();
  };
  const listingOf = (token: SwapToken | null) => (token ? data.listings[form.chain].find((item) => sameAddress(form.chain, item.address, token.address)) ?? null : null);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 pt-2 max-md:gap-5 max-md:pb-20">
      <header className="flex flex-col gap-2">
        <p className="m-0 flex items-center gap-2.5 text-[10px] font-semibold tracking-[0.2em] text-accent-text uppercase">
          <span aria-hidden="true" className="h-px w-6 bg-accent" />
          {s.eyebrow}
        </p>
        <h1 className="font-display text-[clamp(32px,3.2vw,40px)] leading-[1.1] font-extrabold tracking-[-0.045em]">{s.title}</h1>
        <p className="m-0 text-[14px] text-text-2">{s.subtitle}</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <SwapCard
            form={form}
            view={view}
            loading={loading && request !== null}
            balances={{
              pay: payRaw !== null && from ? formatFull({ raw: payRaw, decimals: from.decimals }) : null,
              receive: receiveRaw !== null && to ? formatFull({ raw: receiveRaw, decimals: to.decimals }) : null,
            }}
            presets={[
              { label: "25%", pct: 25 },
              { label: "50%", pct: 50 },
              { label: t.token.trade.max, pct: 100 },
            ]}
            onPreset={preset}
            onPick={setPicking}
            action={action}
            connecting={connecting}
            onConnect={() => void connect()}
            onReview={() => setReviewing(true)}
            actionRef={actionRef}
          />
          {short ? (
            <Link href={href(`/bridge?${new URLSearchParams({ to: form.chain, receive: form.chain === "rh" ? "ETH" : "SOL", return: "/swap" })}`)} className="flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/6 px-3.5 py-2.5 hover:bg-accent/10">
              <span className="flex flex-auto flex-col gap-0.5">
                <span className="text-[12px] font-semibold">{fmt(t.token.trade.bridgeTitle, { chain: CHAINS[form.chain].name })}</span>
                <span className="text-[11px] text-text-2">{t.token.trade.bridgeBody}</span>
              </span>
              <ArrowRight size={16} strokeWidth={2} className="flex-none text-accent-text" aria-hidden="true" />
            </Link>
          ) : null}
          <SwapAssurance />
        </div>
        <SwapSide from={from} to={to} listing={listingOf(to) ?? listingOf(from)} venues={view?.route ?? null} />
      </div>
      {!actionInView ? (
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-line bg-bg-deep/95 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex min-w-0 flex-auto flex-col">
            <span className="text-[11px] text-text-3">{s.estimateBar}</span>
            <span className="truncate font-mono text-[14px] font-semibold">{view && to ? `≈ ${view.outCompact} ${to.symbol}` : "—"}</span>
          </div>
          <SwapAction compact state={action} connecting={connecting} onConnect={() => void connect()} onReview={() => setReviewing(true)} />
        </div>
      ) : null}
      <TokenPicker
        open={picking !== null}
        title={picking === "to" ? s.pickReceive : s.pickPay}
        chain={form.chain}
        listings={data.listings[form.chain]}
        onPick={(token) => {
          if (picking) form.pick(picking, token);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      {from && to ? (
        <SwapReview open={reviewing} onClose={closeReview} from={from} to={to} amount={form.amount} quote={quote} run={run} onConfirm={confirm} />
      ) : null}
    </div>
  );
}
