"use client";

import { Layers } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth } from "@/shared/tonk/format";
import type { ActionRequest, MissionJson, TxEventJson } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { type ActionState, isWorking } from "../../hooks/useAction";
import { bpsPct } from "../../lib/curve-text";
import { ActionNote } from "./ActionNote";

interface PoolFeesProps {
  mission: MissionJson;
  network: TonkNetwork;
  /** The connected wallet, which pays the network fee; null until one connects. */
  owner: string | null;
  action: ActionState;
  onAction: (request: ActionRequest) => void;
  /** Stops watching a share that has been confirming for a long while. */
  onStop?: () => void;
}

type Shared = Extract<TxEventJson, { kind: "shared" }>;

/**
 * A graduated token's pool fees with "Share pool fees": anyone may have the
 * migrator collect them, pay the ETH side to the Crew, the creator and
 * tonkfun.fun, and take the token side out of circulation, which keeps the
 * Crew's share flowing after graduation (review finding L-2). What was
 * shared comes from the receipt's own event.
 */
export function PoolFees({ mission, network, owner, action, onAction, onStop }: PoolFeesProps) {
  const { t } = useI18n();
  const p = t.mission.poolFees;
  const unit = network.unit;
  const mine = action.kind === "share";
  const shared = action.events.find((event): event is Shared => event.kind === "shared" && event.token.toLowerCase() === mission.token.toLowerCase());
  const total = shared ? BigInt(shared.protocolEth) + BigInt(shared.crewEth) + BigInt(shared.creatorEth) : BigInt(0);
  const done = !shared
    ? t.mission.trade.errors.other
    : total === BigInt(0)
      ? fmt(p.nothing, { unit })
      : fmt(p.done, { amount: formatEth(total), unit, crew: formatEth(BigInt(shared.crewEth)), creator: formatEth(BigInt(shared.creatorEth)), protocol: formatEth(BigInt(shared.protocolEth)) });
  return (
    <section aria-labelledby="mission-pool-fees-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 max-md:p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-accent/10 text-accent-text">
          <Layers size={15} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="mission-pool-fees-title" className="font-display text-[16px] leading-5 font-bold tracking-[-0.02em]">
            {p.title}
          </h2>
          <p className="m-0 text-[11px] text-text-3">{fmt(p.sub, { crew: bpsPct(mission.crewBps), creator: bpsPct(mission.creatorBps) })}</p>
        </div>
      </div>
      <p className="m-0 text-[12px] leading-[1.6] text-text-2">{fmt(p.body, { unit })}</p>
      {owner ? (
        <button
          type="button"
          disabled={isWorking(action)}
          onClick={() => onAction({ kind: "share", token: mission.token, owner })}
          className="min-h-10 rounded-lg border border-line-strong bg-raised px-3 text-[13px] font-semibold hover:bg-input disabled:cursor-not-allowed disabled:opacity-60"
        >
          {p.share}
        </button>
      ) : (
        <p className="m-0 text-[12px] leading-[1.6] text-text-3">{p.connect}</p>
      )}
      {mine ? <ActionNote state={action} network={network} done={done} onStop={onStop} /> : null}
    </section>
  );
}
