"use client";

import { Eye, Save } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth } from "@/shared/tonk/format";
import { isInvited, launchInvites } from "@/shared/tonk/invites";
import { LAUNCHPAD_AUDITED, tonkNetwork } from "@/shared/tonk/networks";
import { isTxHash, type TonkSettingsJson } from "@/shared/tonk/types";
import { useWalletBalances } from "@/shared/wallet/useWalletBalances";
import { wallet } from "@/shared/wallet/wallet";
import { AgentCard } from "./components/AgentCard";
import { BasicsCard } from "./components/BasicsCard";
import { EconomicsCard } from "./components/EconomicsCard";
import { actionState, LaunchAction } from "./components/LaunchAction";
import { LaunchReceipt } from "./components/LaunchReceipt";
import { LockCard } from "./components/LockCard";
import { MobileBar } from "./components/MobileBar";
import { PreviewCard, TokenPreview } from "./components/PreviewCard";
import { ReferDialog } from "./components/ReferDialog";
import { ReviewDialog } from "./components/ReviewDialog";
import { ScoreCard } from "./components/ScoreCard";
import { BetaNotice } from "@/shared/ui/BetaNotice";
import { Sheet } from "@/shared/ui/Sheet";
import { StepNav } from "./components/StepNav";
import { SummaryCard } from "./components/SummaryCard";
import { ChainPill, ReferButton, TopBarActions } from "./components/TopBarActions";
import { pairText } from "./components/types";
import type { LaunchData } from "./data/get-launch-data";
import { useLaunchForm } from "./hooks/useLaunchForm";
import { useLaunchRun } from "./hooks/useLaunchRun";
import { useLaunchSettings } from "./hooks/useLaunchSettings";
import { useLaunchTx } from "./hooks/useLaunchTx";
import { scrollToId, useAfterStep, useIsPhone, useStepInView } from "./hooks/useStudioView";
import { agentLabel, feeLabel, lockLabel } from "./lib/labels";
import { launchRequest } from "./lib/request";
import { FIELD_STEP, issuesIn } from "./lib/validate";
import { launchView } from "./lib/view";
import { fmt } from "@/shared/i18n/config";

const SECONDARY = "inline-flex min-h-9 items-center gap-2 rounded-lg border border-line-strong bg-raised px-3 text-[12px] font-semibold whitespace-nowrap hover:bg-input";

/**
 * The Creator Studio: four cards (a four-step flow on phones) beside the
 * token preview, the Mission score and the launch summary; then the review,
 * the wallet, and the receipt read back from the chain.
 */
export function LaunchScreen({ data }: { data: LaunchData }) {
  const { t, href } = useI18n();
  const l = t.launch;
  const { params, setParams } = useUrlParams();
  const [fresh, setFresh] = useState<TonkSettingsJson | null>(null);
  const live = useLaunchSettings(data, fresh);
  const state = useLaunchForm(live.settings, data.settings?.chainId ?? 0);
  const { form } = state;
  const view = useMemo(() => launchView(form, live.settings), [form, live.settings]);
  const { owner, balances } = useWalletBalances("rh", null);
  const phone = useIsPhone();
  const inView = useStepInView();
  const step = Math.min(4, Math.max(1, Number(params.get("step")) || 1));
  const hash = isTxHash(params.get("tx") ?? "") ? params.get("tx") : null;
  const tx = useLaunchTx(hash);

  const [dialog, setDialog] = useState<"review" | "refer" | "preview" | "reset" | null>(null);
  const [connecting, setConnecting] = useState(false);
  const onSent = useCallback((sent: string) => {
    setDialog(null);
    setParams({ tx: sent, step: null });
  }, [setParams]);
  const { state: run, start, reset: resetRun } = useLaunchRun({ mode: data.mode, shown: live.settings, onSettings: setFresh, onSent });

  const unit = data.unit;
  const total = `${formatEth(view.payNow)} ${unit}`;
  const wrong = issuesIn(state.issues, "all");
  // The guarded launch: while an invite list is set, only its wallets can launch from this studio.
  const invited = isInvited(owner);
  const action = actionState(t, { hasVisibleErrors: wrong.some(state.showsError), owner, invited, balance: balances ? BigInt(balances.native.raw) : null, payNow: view.payNow, offline: live.offline, paused: live.paused, unit });
  const afterStep = useAfterStep(step);
  /** Phones: shows another step, then focuses `focusId` or lands on the step bar. False when it's already showing. */
  const showStep = (next: number, focusId?: string) => {
    if (next === step) return false;
    afterStep(focusId);
    setParams({ step: next === 1 ? null : String(next) });
    return true;
  };
  const goStep = (next: number) => {
    if (!phone) return scrollToId(`step-${next}`);
    if (next > step && !state.check(step as 1 | 2 | 3 | 4)) return;
    showStep(next);
  };
  const onAction = async () => {
    if (action.kind === "connect") {
      setConnecting(true);
      await wallet.connect("rh");
      return setConnecting(false);
    }
    if (state.check("all")) return setDialog("review");
    const first = `launch-${wrong[0]}`;
    if (!phone || !showStep(FIELD_STEP[wrong[0]], first)) requestAnimationFrame(() => document.getElementById(first)?.focus());
  };
  const button = <LaunchAction state={action} busy={connecting} onClick={() => void onAction()} />;
  const studio = { state, view, settings: live.settings, unit };
  const note = data.mode === "mock" ? l.review.demoNote : l.review.signNote;

  if (hash) {
    return (
      <LaunchReceipt
        hash={hash}
        tx={tx}
        chainName={data.chainName}
        unit={unit}
        explorerUrl={data.explorerUrl}
        tokenHref={tonkNetwork() ? (token) => href(`/token/${token}`) : undefined}
        onBack={(launched) => {
          if (launched) state.reset();
          resetRun();
          setParams({ tx: null });
        }}
      />
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[1290px] flex-col pt-2 max-md:pb-24">
      <TopBarActions onRefer={() => setDialog("refer")} />
      <header className="mb-7 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 max-md:mb-5">
        <div className="min-w-0">
          <p className="m-0 mb-2.5 flex items-center gap-2.5 text-[10px] font-semibold tracking-[0.2em] text-accent-text uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-accent" />
            {l.eyebrow}
          </p>
          <h1 className="font-display text-[clamp(34px,3.4vw,43px)] leading-[1.1] font-extrabold tracking-[-0.045em]">{l.title}</h1>
          <p className="m-0 mt-3 max-w-[520px] text-[14px] leading-[1.7] text-text-2">{l.intro}</p>
        </div>
        <div className="flex flex-col items-end gap-2 max-md:flex-row max-md:flex-wrap max-md:items-center">
          {data.mode === "mock" ? <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-text-3 uppercase">{l.demoTag}</span> : null}
          <button type="button" onClick={state.save} className={SECONDARY}>
            <Save size={13} strokeWidth={2} aria-hidden="true" />
            {l.saveDraft}
          </button>
          <span role="status" className="text-[11px] text-text-3">
            {state.draft === "saved" ? l.draftSaved : state.draft === "unsaved" ? l.draftUnsaved : l.draftDevice}
          </span>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 lg:hidden">
        <ChainPill />
        <div className="flex items-center gap-1">
          <ReferButton onClick={() => setDialog("refer")} />
          <button type="button" onClick={() => setDialog("preview")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left text-[12px] font-medium text-accent-text hover:bg-raised md:hidden">
            <Eye size={14} strokeWidth={2} aria-hidden="true" className="flex-none" />
            {l.preview.title}
          </button>
        </div>
      </div>
      {data.mode === "mainnet" && !LAUNCHPAD_AUDITED ? <BetaNotice text={l.beta} className="mb-4" /> : null}
      {launchInvites() !== null && !invited ? <BetaNotice text={l.invite} className="mb-4" /> : null}
      {live.paused ? <BetaNotice text={l.pausedNotice} className="mb-4" /> : null}
      {live.offline ? <p role="alert" className="m-0 mb-4 rounded-lg border border-warn/25 bg-warn/7 px-3.5 py-3 text-[13px] text-warn">{l.offline}</p> : null}
      <StepNav
        active={phone ? step : inView}
        onGo={goStep}
        steps={[
          { title: l.steps.basics, sub: `Tonkfun Native · ${pairText(form.ticker)}` },
          { title: l.steps.lock, sub: lockLabel(l, form, view.locks) },
          { title: l.steps.economics, sub: fmt(l.steps.economicsSub, { crew: feeLabel(l, form.crew), creator: feeLabel(l, form.creator) }) },
          { title: l.steps.agent, sub: agentLabel(l, form) },
        ]}
      />
      <div className="grid items-start gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-6">
          <BasicsCard {...studio} note={data.mode === "mock" ? l.demoNote : l.liveNote} hiddenOnPhone={step !== 1} />
          <LockCard {...studio} hiddenOnPhone={step !== 2} />
          <EconomicsCard {...studio} hiddenOnPhone={step !== 3} />
          <AgentCard {...studio} hiddenOnPhone={step !== 4} />
          <div className="flex justify-end">
            <button type="button" onClick={() => setDialog("reset")} className="rounded px-1 py-1.5 text-[12px] text-text-3 underline decoration-line-strong underline-offset-4 hover:text-text-2">
              {l.resetDraft}
            </button>
          </div>
        </div>
        {/* Beside the form on wide screens (it scrolls by itself); under it in two columns on tablets. */}
        <aside className="flex min-w-0 flex-col gap-3.5 max-md:hidden md:max-[1199px]:grid md:max-[1199px]:grid-cols-2 md:max-[1199px]:grid-rows-[auto_1fr] md:max-[1199px]:items-start md:max-[1199px]:gap-4 min-[1200px]:sticky min-[1200px]:top-6 min-[1200px]:max-h-[calc(100dvh-48px)] min-[1200px]:overflow-y-auto">
          <PreviewCard {...studio} />
          <ScoreCard view={view} />
          <div className="min-w-0 md:max-[1199px]:col-start-2 md:max-[1199px]:row-span-2 md:max-[1199px]:row-start-1">
            <SummaryCard {...studio} chainName={data.chainName} action={button} note={note} faucetUrl={action.kind === "funds" ? data.faucetUrl : null} />
          </div>
        </aside>
      </div>
      <MobileBar step={step} total={total} onBack={() => goStep(step - 1)} onNext={() => goStep(step + 1)} action={button} />
      <Sheet open={dialog === "preview"} onClose={() => setDialog(null)} title={l.preview.dialogTitle}>
        <TokenPreview {...studio} />
        <ScoreCard view={view} open />
      </Sheet>
      <Sheet open={dialog === "reset"} onClose={() => setDialog(null)} title={l.resetTitle} subtitle={l.resetBody}>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => {
              state.reset();
              setDialog(null);
            }}
            className="min-h-11 flex-auto rounded-lg bg-cta px-4 text-[13px] font-semibold text-on-cta"
          >
            {l.resetConfirm}
          </button>
          <button type="button" onClick={() => setDialog(null)} className="min-h-11 flex-auto rounded-lg border border-line-strong bg-raised px-4 text-[13px] font-semibold hover:bg-input">
            {l.resetKeep}
          </button>
        </div>
      </Sheet>
      <ReviewDialog
        open={dialog === "review"}
        onClose={() => {
          setDialog(null);
          resetRun();
        }}
        {...studio}
        chainName={data.chainName}
        run={run}
        note={note}
        onConfirm={() => owner && void start(launchRequest(form, view, owner))}
      />
      <ReferDialog open={dialog === "refer"} onClose={() => setDialog(null)} owner={owner} />
    </div>
  );
}
