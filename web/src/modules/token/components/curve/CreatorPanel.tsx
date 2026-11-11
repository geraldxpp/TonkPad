"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatTokens, formatTokensFull } from "@/shared/tonk/format";
import { claimableAt, DAY_SECONDS, extendLock, lockedAt, MIN_EXTENSION_DAYS } from "@/shared/tonk/lock";
import { type ActionRequest, type MissionJson, missionLock } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { type ActionState, isWorking } from "../../hooks/useAction";
import { formatDate } from "../../lib/format";
import { ActionNote } from "./ActionNote";
import { EditDialog } from "./EditDialog";
import { ExtendDialog } from "./ExtendDialog";

const SECONDARY = "min-h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold hover:bg-input disabled:cursor-not-allowed disabled:opacity-60";

interface CreatorPanelProps {
  mission: MissionJson;
  network: TonkNetwork;
  /** The connected wallet: the mission's creator. */
  owner: string;
  action: ActionState;
  onAction: (request: ActionRequest) => void;
  /** Stops watching an action that has been confirming for a long while. */
  onStop?: () => void;
}

/**
 * The creator's tools, shown only to the wallet that launched the token:
 * what is still locked, what has unlocked and can be claimed, and the lock's
 * end; then Claim, Extend lock and Edit details. Each runs through the
 * wallet and counts only from its confirmed receipt.
 */
export function CreatorPanel({ mission, network, owner, action, onAction, onStop }: CreatorPanelProps) {
  const { t, lang } = useI18n();
  const c = t.mission.creator;
  const f = t.mission.facts;
  const [dialog, setDialog] = useState<"extend" | "edit" | null>(null);
  const ticker = mission.symbol;
  const now = Math.floor(mission.readAt / 1000);
  const lock = mission.lock ? missionLock(mission.lock) : null;
  const claimable = lock ? claimableAt(lock, now) : BigInt(0);
  const canExtend = lock !== null && typeof extendLock(lock, now, MIN_EXTENSION_DAYS * DAY_SECONDS) !== "string";
  const busy = isWorking(action);
  const day = (seconds: number) => formatDate(seconds * 1000, lang);
  const amount = (wei: bigint) => `${formatTokens(wei)} ${ticker}`;

  const mine = action.kind === "claim" || action.kind === "extend" || action.kind === "edit";
  const claimed = action.events.find((event) => event.kind === "claimed");
  const extended = action.events.find((event) => event.kind === "extended");
  const done =
    action.kind === "claim" && claimed?.kind === "claimed"
      ? fmt(c.doneClaim, { amount: formatTokens(BigInt(claimed.amount)), ticker })
      : action.kind === "extend" && extended?.kind === "extended"
        ? fmt(c.doneExtend, { date: day(extended.lockEnd) })
        : action.kind === "edit" && action.events.some((event) => event.kind === "edited")
          ? c.doneEdit
          : t.mission.trade.errors.other;
  const note = mine ? <ActionNote state={action} network={network} done={done} onStop={onStop} /> : null;
  const figures: [string, string, string][] = lock
    ? [
        [f.locked, amount(lockedAt(lock, now)), formatTokensFull(lockedAt(lock, now))],
        [f.claimable, amount(claimable), formatTokensFull(claimable)],
        [f.claimed, amount(lock.claimed), formatTokensFull(lock.claimed)],
        [f.ends, day(lock.end), new Date(lock.end * 1000).toISOString()],
      ]
    : [];
  return (
    <section aria-labelledby="mission-creator-title" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-locked/25 bg-surface p-5 max-md:p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-locked/10 text-locked">
          <Lock size={15} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="mission-creator-title" className="font-display text-[16px] leading-5 font-bold tracking-[-0.02em]">
            {c.title}
          </h2>
          <p className="m-0 text-[11px] text-text-3">{c.sub}</p>
        </div>
      </div>
      {lock ? (
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 min-[900px]:grid-cols-4">
          {figures.map(([label, value, full]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-[11px] text-text-3">{label}</dt>
              <dd title={full} className="m-0 font-mono text-[14px] leading-5 font-semibold [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 text-[13px] text-text-2">{c.noLock}</p>
      )}
      {lock?.type === "time" && now < lock.end ? <p className="m-0 text-[12px] leading-[1.6] text-text-3">{c.timeLockNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        {lock ? (
          <button
            type="button"
            disabled={busy || claimable === BigInt(0)}
            onClick={() => onAction({ kind: "claim", token: mission.token, owner })}
            className="min-h-10 flex-[2_1_220px] rounded-lg bg-cta px-3.5 text-[13px] font-semibold text-on-cta disabled:cursor-not-allowed disabled:border disabled:border-line-strong disabled:bg-input disabled:text-text-2"
          >
            {claimable === BigInt(0) ? c.nothing : fmt(c.claim, { amount: formatTokens(claimable), ticker })}
          </button>
        ) : null}
        {canExtend ? (
          <button type="button" aria-haspopup="dialog" disabled={busy} onClick={() => setDialog("extend")} className={SECONDARY}>
            {c.extend}
          </button>
        ) : null}
        <button type="button" aria-haspopup="dialog" disabled={busy} onClick={() => setDialog("edit")} className={SECONDARY}>
          {c.edit}
        </button>
      </div>
      {dialog === null ? note : null}
      {lock ? (
        <ExtendDialog
          open={dialog === "extend"}
          onClose={() => setDialog(null)}
          lock={lock}
          now={now}
          busy={busy}
          note={dialog === "extend" && action.kind === "extend" ? note : null}
          formatDate={day}
          onExtend={(days) => onAction({ kind: "extend", token: mission.token, owner, days })}
        />
      ) : null}
      <EditDialog
        // What is on-chain is where the form starts: a saved edit starts it afresh.
        key={`${mission.metadata}\n${mission.agentPrompt}`}
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        mission={mission}
        owner={owner}
        busy={busy}
        note={dialog === "edit" && action.kind === "edit" ? note : null}
        onAction={onAction}
      />
    </section>
  );
}
