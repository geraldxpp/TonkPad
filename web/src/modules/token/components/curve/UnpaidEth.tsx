"use client";

import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth } from "@/shared/tonk/format";
import type { ActionRequest } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { type ActionState, isWorking } from "../../hooks/useAction";
import { ActionNote } from "./ActionNote";

interface UnpaidEthProps {
  /** Wei the launchpad is holding for the wallet. */
  amount: bigint;
  owner: string;
  network: TonkNetwork;
  action: ActionState;
  onAction: (request: ActionRequest) => void;
}

/**
 * ETH the launchpad could not deliver to the connected wallet (a fee or a
 * refund whose transfer failed), with Withdraw. Rare, so it only shows when
 * there is some, or while a withdrawal is being reported.
 */
export function UnpaidEth({ amount, owner, network, action, onAction }: UnpaidEthProps) {
  const { t } = useI18n();
  const u = t.mission.unpaid;
  const unit = network.unit;
  const mine = action.kind === "withdraw";
  const withdrawn = action.events.find((event) => event.kind === "withdrawn");
  if (amount === BigInt(0) && !mine) return null;
  return (
    <section aria-labelledby="mission-unpaid-title" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-warn/25 bg-warn/5 p-5 max-md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="mission-unpaid-title" className="text-[14px] font-semibold">
            {u.title}
          </h2>
          {amount > BigInt(0) ? <p className="m-0 text-[12px] leading-[1.6] text-text-2">{fmt(u.body, { amount: formatEth(amount), unit })}</p> : null}
        </div>
        {amount > BigInt(0) ? (
          <button
            type="button"
            disabled={isWorking(action)}
            onClick={() => onAction({ kind: "withdraw", owner })}
            className="min-h-10 flex-none rounded-lg bg-cta px-4 text-[13px] font-semibold text-on-cta disabled:cursor-not-allowed disabled:opacity-60"
          >
            {u.withdraw}
          </button>
        ) : null}
      </div>
      {mine ? <ActionNote state={action} network={network} done={withdrawn?.kind === "withdrawn" ? fmt(u.done, { amount: formatEth(BigInt(withdrawn.amount)), unit }) : t.mission.trade.errors.other} /> : null}
    </section>
  );
}
