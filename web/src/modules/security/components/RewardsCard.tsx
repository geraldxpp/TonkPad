import { fmt } from "@/shared/i18n/config";
import { cn } from "@/shared/lib/cn";
import { type Rewards, type Severity, SEVERITIES } from "../lib/rewards";
import { SecurityCard, type SecurityMessages } from "./SecurityCard";

/** Each severity's dot; the label itself stays in the text colour, so it reads in both themes. */
const DOT: Record<Severity, string> = { critical: "bg-neg", high: "bg-hot", medium: "bg-warn", low: "bg-text-3" };

const BODY = { critical: "criticalBody", high: "highBody", medium: "mediumBody", low: "lowBody" } as const;

/** 4. Rewards by severity: the owner's amount, or "Decided case by case" until one is set. */
export function RewardsCard({ s, rewards }: { s: SecurityMessages; rewards: Rewards }) {
  const r = s.rewards;
  return (
    <SecurityCard id="security-rewards" title={r.title}>
      <p className="m-0 mt-2 text-[13px] leading-5 text-text-2">{r.intro}</p>
      <ul className="m-0 mt-2 flex list-none flex-col p-0">
        {SEVERITIES.map((level) => {
          const amount = rewards[level];
          return (
            <li key={level} data-severity={level} className="border-b border-line py-3.5 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold">
                  <span aria-hidden="true" className={cn("size-1.5 flex-none rounded-full", DOT[level])} />
                  {r[level]}
                </span>
                {amount ? (
                  <span className="min-w-0 font-mono text-[13px] font-semibold [overflow-wrap:anywhere]">{fmt(r.upTo, { amount })}</span>
                ) : (
                  <span className="text-[12px] text-text-3">{r.caseByCase}</span>
                )}
              </div>
              <p className="m-0 mt-1.5 text-[12px] leading-[18px] text-text-3">{r[BODY[level]]}</p>
            </li>
          );
        })}
      </ul>
    </SecurityCard>
  );
}
