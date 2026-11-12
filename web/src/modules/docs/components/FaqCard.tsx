import { DocsCard, type DocsMessages } from "./ui";

/** The FAQ's questions, in order: each has a q… and an a… message. */
export const FAQ = ["early", "graduate", "fees", "locked", "sell", "crewFee", "crewPaid", "liquidity", "change", "audit"] as const;

/** 10. FAQ: short answers to the questions new creators and traders ask first. */
export function FaqCard({ d }: { d: DocsMessages }) {
  const q = d.faq;
  return (
    <DocsCard id="faq" title={q.title}>
      <dl className="m-0 mt-3 flex flex-col divide-y divide-line">
        {FAQ.map((id) => (
          <div key={id} className="py-3 first:pt-1 last:pb-0">
            <dt className="text-[13px] leading-5 font-semibold">{q.questions[id]}</dt>
            <dd className="m-0 mt-1 text-[13px] leading-5 text-text-2">{q.answers[id]}</dd>
          </div>
        ))}
      </dl>
    </DocsCard>
  );
}
