import { ShieldCheck } from "lucide-react";
import { DotList, SecurityCard, type SecurityMessages } from "./SecurityCard";

/** 3. Rules: no one else's funds, no denial of service, time to fix before disclosure; then the safe harbour. */
export function RulesCard({ s }: { s: SecurityMessages }) {
  const r = s.rules;
  return (
    <SecurityCard id="security-rules" title={r.title}>
      <DotList items={[r.funds, r.noDos, r.disclosure]} />
      <div className="mt-5 rounded-xl border border-line bg-raised/40 px-4 py-3.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" className="flex-none text-accent-text" />
          {r.harbourTitle}
        </h3>
        <p className="m-0 mt-1.5 text-[13px] leading-5 text-text-2">{r.harbour}</p>
      </div>
    </SecurityCard>
  );
}
