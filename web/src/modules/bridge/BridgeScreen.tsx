"use client";

import { ArrowDown, ArrowRight, Eye, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import { amountText, formatFull, presetAmount } from "@/shared/swap/amounts";
import { Sheet } from "@/shared/ui/Sheet";
import { buttonClasses } from "@/shared/ui/Button";
import { Tabs } from "@/shared/ui/Tabs";
import { useWallet, wallet } from "@/shared/wallet/wallet";
import { ArrivalCard } from "./components/ArrivalCard";
import { BridgeAction } from "./components/BridgeAction";
import { FeesDetails } from "./components/FeesDetails";
import { GasOption } from "./components/GasOption";
import { JourneyCard } from "./components/JourneyCard";
import { AssetPicker, NetworkPicker } from "./components/Pickers";
import { ProgressDialog } from "./components/ProgressDialog";
import { RecentPanel } from "./components/RecentPanel";
import { RecipientRow } from "./components/RecipientRow";
import { ReviewDialog } from "./components/ReviewDialog";
import { RoutesCard } from "./components/RoutesCard";
import { TransferFields } from "./components/TransferFields";
import { useBridgeBalance } from "./hooks/useBridgeBalance";
import { useBridgeForm } from "./hooks/useBridgeForm";
import { useBridgeRoutes } from "./hooks/useBridgeRoutes";
import { useBridgeRun } from "./hooks/useBridgeRun";
import { useTrackTransfers } from "./hooks/useTrackTransfers";
import type { RoutesRequest } from "./lib/api";
import { isNetworkAddress, NATIVE_EVM, walletChainOf } from "./lib/networks";
import { inFlight, useRecentTransfers } from "./lib/recent";
import { actionState, amountOut, chosenRoute, etaText } from "./lib/view";

const money = (value: number | null) => (value === null ? null : formatUsd(value));

/** Module 6: Bridge. Moves a major asset between networks, into Robinhood Chain above all, by the best live route. */
export function BridgeScreen() {
  const { t } = useI18n();
  const b = t.bridge;
  const form = useBridgeForm();
  const { from, to, asset, receive } = form;
  const { accounts } = useWallet();
  const sender = accounts[walletChainOf(from)] ?? null;
  const owner = accounts[walletChainOf(to)] ?? null;
  const typed = form.customAddress.trim();
  const customValid = form.custom && typed !== NATIVE_EVM && isNetworkAddress(to, typed);
  const recipient = form.custom ? (customValid ? typed : null) : owner;
  const gas = form.gas && !receive.native && to.vm === "evm";

  const request: RoutesRequest | null = form.raw ? { from: from.id, to: to.id, asset: asset.symbol, receive: receive.symbol, amount: form.raw, sender, recipient, gasTopUp: gas } : null;
  const { routes, loading, error, tradingOpen } = useBridgeRoutes(request);
  const route = chosenRoute(routes, form.routeId);
  const balance = useBridgeBalance(from, asset, sender);
  const destination = useBridgeBalance(to, null, owner);
  const transfers = useRecentTransfers();
  useTrackTransfers(transfers);

  const [tab, setTab] = useState<"bridge" | "recent">("bridge");
  const [pickingNetwork, setPickingNetwork] = useState<"from" | "to" | null>(null);
  const [pickingAsset, setPickingAsset] = useState<"from" | "to" | null>(null);
  const [how, setHow] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [progressId, setProgressId] = useState<string | null>(null);
  // Once it has left the wallet, the review gives way to following it.
  const { state: run, run: start, reset } = useBridgeRun((id) => {
    setProgressId(id);
    setReviewing(false);
    form.setAmount("");
  });
  const progress = useMemo(() => transfers.find((item) => item.id === progressId) ?? null, [transfers, progressId]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const action = actionState(b, { from, to, asset, sender, anyWallet: Object.keys(accounts).length > 0, recipient, recipientBad: form.custom && !customValid, raw: form.raw, balance: balance.amount, coinBalance: balance.coin, route, loading, error, tradingOpen });
  const connect = async () => {
    setConnecting(true);
    await wallet.connect(walletChainOf(action.kind === "connect-to" ? to : from));
    setConnecting(false);
  };
  const preset = (pct: number) => {
    if (balance.amount === null) return;
    const raw = presetAmount(balance.amount, pct, pct === 100 && asset.native ? BigInt(from.feeReserve) : BigInt(0));
    form.setAmount(raw ? amountText(raw, asset.decimals) : "0");
  };
  const confirm = () => {
    if (!request || !sender || !recipient || !route) return;
    void start({ ...request, sender, recipient }, route, { from, to, sentSymbol: asset.symbol, sentText: form.amount, received: receive });
  };
  const closeReview = () => {
    setReviewing(false);
    reset();
  };

  const eta = route ? etaText(b, route.etaSeconds) : null;
  const received = route ? amountOut(route.outAmount, receive) : "";
  const moving = transfers.find(inFlight) ?? null;
  const nextHref = form.returnTo ?? (to.id === "rh" ? "/swap?chain=rh" : to.id === "sol" ? "/swap" : null);
  const nextLabel = form.returnTo?.startsWith("/token/") ? b.arrival.backToToken : b.arrival.swap;
  const balanceText = balance.amount === null ? null : formatFull({ raw: balance.amount, decimals: asset.decimals });
  const destinationEmpty = destination.coin === "0";

  return (
    <div className="mx-auto flex w-full max-w-[1160px] min-w-0 flex-col max-[999px]:max-w-[760px] max-[999px]:pb-24">
      <header className="mb-[30px] max-[599px]:mb-[22px]">
        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold tracking-[1.7px] text-accent-text uppercase">
          <span aria-hidden="true" className="block h-px w-[22px] bg-accent" />
          {b.eyebrow}
        </div>
        <h1 className="font-display text-[38px] leading-[1.1] font-extrabold tracking-[-1.6px] max-[599px]:text-[28px] max-[599px]:tracking-[-1.1px]">{b.title}</h1>
        <p className="m-0 mt-[9px] text-[12px] text-text-3">{b.subtitle}</p>
      </header>
      <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <div className="min-w-0">
          {moving ? (
            <button type="button" aria-haspopup="dialog" onClick={() => setProgressId(moving.id)} className="mb-3.5 flex w-full items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/6 px-4 py-3 text-left text-[12px]">
              <span className="min-w-0 truncate">{fmt(b.banner, { amount: moving.to.amount, symbol: moving.to.symbol })}</span>
              <span className="flex flex-none items-center gap-1 font-semibold text-accent-text">
                {b.bannerView}
                <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          ) : null}
          <section aria-label={b.tabs.label} className="overflow-hidden rounded-2xl border border-line-strong bg-surface max-[599px]:rounded-[14px]">
            <div className="flex h-[60px] items-center justify-between border-b border-line px-6 [--tab-h-phone:60px] [--tab-h:60px] max-[599px]:h-[51px] max-[599px]:px-4 max-[599px]:[--tab-h-phone:51px]">
              <Tabs size="flush" label={b.tabs.label} panelId="bridge-panel" idPrefix="bridge-tab" value={tab} onChange={setTab} className="-mb-px self-stretch" tabs={[{ id: "bridge", label: b.tabs.bridge }, { id: "recent", label: b.tabs.recent, trailing: <span className="rounded bg-raised px-[5px] py-px font-mono text-[10px] text-text-3">{transfers.length}</span> }]} />
              <button type="button" aria-haspopup="dialog" aria-label={b.how.open} title={b.how.open} onClick={() => setHow(true)} className="inline-flex size-[26px] items-center justify-center rounded-md text-text-3 hover:bg-raised hover:text-text">
                <Info size={16} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
            <div id="bridge-panel" role="tabpanel" aria-labelledby={`bridge-tab-${tab}`}>
              {tab === "recent" ? (
                <RecentPanel transfers={transfers} onStart={() => setTab("bridge")} onOpen={setProgressId} />
              ) : (
                <div className="px-6 pt-5 pb-[22px] max-[599px]:px-3 max-[599px]:pt-[13px] max-[599px]:pb-[15px]">
                  <TransferFields form={form} received={received} sentUsd={money(route?.inUsd ?? null)} receivedUsd={money(route?.outUsd ?? null)} eta={eta} loading={loading && request !== null} balance={balanceText} onNetwork={setPickingNetwork} onAsset={setPickingAsset} onPreset={preset} />
                  {action.note ? (
                    <p role="alert" className={cn("m-0 mt-3 text-[12px]", tradingOpen === false ? "text-text-3" : "text-neg")}>
                      {action.note}
                    </p>
                  ) : null}
                  <RecipientRow network={to} owner={owner} custom={form.custom} address={form.customAddress} bad={form.custom && typed !== "" && !customValid} onCustom={form.setCustom} onAddress={form.setCustomAddress} />
                  <GasOption to={to} receive={receive} on={form.gas} empty={destinationEmpty} onChange={form.setGas} />
                  <FeesDetails route={route} receive={receive} />
                  <a href="#routes-title" className="mt-4 flex min-h-[34px] items-center justify-between border-t border-line pt-3.5 text-[12px] text-accent-text min-[1000px]:hidden">
                    {b.jump}
                    <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
                  </a>
                  <div className="max-[999px]:hidden">
                    <BridgeAction state={action} connecting={connecting} onConnect={() => void connect()} onReview={() => setReviewing(true)} />
                    <p className="m-0 mt-3 text-center text-[11px] text-text-3">{b.note}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <div className="mt-[18px] flex items-center justify-center gap-[7px] text-[11px] text-text-3">
            <Eye size={13} strokeWidth={1.9} aria-hidden="true" />
            <span>{b.assure}</span>
          </div>
        </div>
        <aside aria-label={b.aside} className="flex min-w-0 flex-col gap-[18px] max-[999px]:grid max-[999px]:grid-cols-2 max-[999px]:items-start max-[599px]:flex">
          <JourneyCard from={from} to={to} eta={eta} />
          <div className="max-[599px]:order-first">
            <RoutesCard routes={routes} picked={form.routeId} loading={loading && request !== null} active={request !== null} onPick={form.setRoute} />
          </div>
          <div className="max-[999px]:col-span-2">
            <ArrivalCard nextHref={nextHref} nextLabel={nextLabel} />
          </div>
        </aside>
      </div>
      {tab === "bridge" ? (
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-2.5 border-t border-line-strong bg-surface/96 px-4 py-2.5 backdrop-blur-md min-[768px]:bottom-0 min-[1000px]:hidden">
          <div className="min-w-0">
            <span className="mb-1 flex items-center gap-[5px] text-[10px] text-text-3">
              {b.bar}
              {eta ? <span className="font-mono text-accent-text">{eta}</span> : null}
            </span>
            <strong className="block truncate font-mono text-[13px] font-semibold">{route ? `${received} ${receive.symbol}` : "—"}</strong>
          </div>
          <BridgeAction compact state={action} connecting={connecting} onConnect={() => void connect()} onReview={() => setReviewing(true)} />
        </div>
      ) : null}
      <NetworkPicker side={pickingNetwork} selected={pickingNetwork === "to" ? to.id : from.id} onPick={(id) => { if (pickingNetwork) form.setNetwork(pickingNetwork, id); setPickingNetwork(null); }} onClose={() => setPickingNetwork(null)} />
      <AssetPicker side={pickingAsset} network={pickingAsset === "to" ? to : from} selected={pickingAsset === "to" ? receive.symbol : asset.symbol} onPick={(symbol) => { if (pickingAsset) form.setAsset(pickingAsset, symbol); setPickingAsset(null); }} onClose={() => setPickingAsset(null)} />
      <ReviewDialog open={reviewing} onClose={closeReview} from={from} to={to} asset={asset} receive={receive} amount={form.amount} route={route} recipient={recipient} custom={form.custom} run={run} onConfirm={confirm} />
      <ProgressDialog transfer={progress} now={now} onClose={() => setProgressId(null)} nextHref={nextHref} nextLabel={nextLabel} />
      <Sheet open={how} onClose={() => setHow(false)} title={b.how.title}>
        {[[b.how.step1Title, b.how.step1Body], [b.how.step2Title, b.how.step2Body], [b.how.step3Title, b.how.step3Body], [b.how.routesTitle, b.how.routesBody]].map(([title, body]) => (
          <p key={title} className="m-0 text-[13px] leading-[1.7] text-text-3">
            <strong className="font-semibold text-text">{title}</strong>
            <br />
            {body}
          </p>
        ))}
        <button type="button" onClick={() => setHow(false)} className={buttonClasses("cta", "md", "w-full")}>
          {b.how.done}
        </button>
      </Sheet>
    </div>
  );
}
