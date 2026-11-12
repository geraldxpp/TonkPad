import { Check } from "lucide-react";
import { BetaNotice } from "@/shared/ui/BetaNotice";
import { SecurityCard, type SecurityMessages } from "./SecurityCard";

/** 5. What was checked, briefly and honestly, under a plain note that there was no outside audit. */
export function CheckedCard({ s }: { s: SecurityMessages }) {
  const c = s.checked;
  const items = [c.reviews, c.static, c.fuzzing, c.proofs, c.attacks, c.rehearsal, c.testnet];
  return (
    <SecurityCard id="security-checked" title={c.title}>
      <BetaNotice text={c.noAudit} className="mt-3" />
      <p className="m-0 mt-4 text-[13px] leading-5 text-text-2">{c.intro}</p>
      <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[13px] leading-5 text-text-2">
            <Check size={14} strokeWidth={2.2} aria-hidden="true" className="mt-[3px] flex-none text-pos" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </SecurityCard>
  );
}
