"use client";

import { Zap } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth } from "@/shared/tonk/format";
import type { ActionRequest, MissionJson, TxEventJson } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { type ActionState, isWorking } from "../../hooks/useAction";
import type { AccountView } from "../../hooks/useMissionAccount";
import { bpsPct } from "../../lib/curve-text";
import { ActionNote } from "./ActionNote";

interface RewardsCardProps {
  mission: MissionJson;
  network: TonkNetwork;
  view: AccountView;
  action: ActionState;
  onAction: (request: ActionRequest) => void;
}

/**
 * Crew Rewards on a mission: the rate, what holders have been paid, and the
 * connected wallet's unpaid part with Claim. Rewards are sent whenever a
 * holder's tokens move, so "unpaid" is only what is still waiting.
 */
export function RewardsCard({ mission, network, view, action, onAction }: RewardsCardProps) {
  const { t } = useI18n();
  const r = t.mission.rewards;
  const unit = network.unit;
  const { owner, account } = view;
  const unpaid = account ? BigInt(account.unpaidRewards) : null;
  const mine = action.kind === "rewards";
  const busy = isWorking(action);
  const paid = action.events.filter((event): event is Extract<TxEventJson, { kind: "rewards" }> => event.kind === "rewards").reduce((sum, event) => sum + BigInt(event.amount), BigInt(0));
  return (
    <section aria-labelledby="mission-rewards-title" className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 max-md:p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Zap size={15} fill="currentColor" stroke="none" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="mission-rewards-title" className="font-display text-[16px] leading-5 font-bold tracking-[-0.02em]">
            {t.launch.economics.crewTitle}
          </h2>
          <p className="m-0 text-[11px] text-text-3">{fmt(r.sub, { pct: bpsPct(mission.crewBps) })}</p>
        </div>
      </div>
      <dl className="m-0 flex flex-col gap-2 text-[12px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-3">{r.paid}</dt>
          <dd className="m-0 font-mono text-[15px] font-semibold text-gold">
            {formatEth(BigInt(mission.crewPaid))} {unit}
          </dd>
        </div>
        {owner ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-3">{r.yours}</dt>
            <dd className="m-0 font-mono text-[13px] font-semibold">{unpaid === null ? "—" : `${formatEth(unpaid)} ${unit}`}</dd>
          </div>
        ) : null}
      </dl>
      {!owner ? <p className="m-0 text-[12px] leading-[1.6] text-text-3">{r.connect}</p> : null}
      {owner && unpaid !== null && unpaid === BigInt(0) && !mine ? <p className="m-0 text-[12px] leading-[1.6] text-text-3">{r.none}</p> : null}
      {owner && unpaid !== null && unpaid > BigInt(0) ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction({ kind: "rewards", token: mission.token, owner })}
          className="min-h-10 rounded-lg border border-gold/35 bg-gold/10 px-3 text-[13px] font-semibold text-gold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {fmt(r.claim, { amount: formatEth(unpaid), unit })}
        </button>
      ) : null}
      {mine ? <ActionNote state={action} network={network} done={fmt(r.done, { amount: formatEth(paid), unit })} /> : null}
    </section>
  );
}
