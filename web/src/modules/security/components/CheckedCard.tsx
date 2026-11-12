import { Check } from "lucide-react";
import { SecurityCard, type SecurityMessages } from "./SecurityCard";

/** 5. What was checked, briefly and honestly. */
export function CheckedCard({ s }: { s: SecurityMessages }) {
  const c = s.checked;
  const items = [c.reviews, c.static, c.fuzzing, c.proofs, c.attacks, c.rehearsal, c.testnet];
  return (
    <SecurityCard id="security-checked" title={c.title}>
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
