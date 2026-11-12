import { CheckedCard } from "./components/CheckedCard";
import { ReportCard } from "./components/ReportCard";
import { RewardsCard } from "./components/RewardsCard";
import { RulesCard } from "./components/RulesCard";
import { ScopeCard } from "./components/ScopeCard";
import type { SecurityMessages } from "./components/SecurityCard";
import type { SecurityData } from "./data/get-security-data";

interface SecurityViewProps {
  s: SecurityMessages;
  data: SecurityData;
}

const COLUMN = "flex min-w-0 flex-col gap-6 max-[599px]:gap-4";

/**
 * The Security page: report and scope on the left; rules, rewards and what
 * was checked on the right. On narrower screens it is one column, in that order.
 */
export function SecurityView({ s, data }: SecurityViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1160px] min-w-0 flex-col">
      <header className="mb-[30px] max-[599px]:mb-[22px]">
        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold tracking-[1.7px] text-accent-text uppercase">
          <span aria-hidden="true" className="block h-px w-[22px] bg-accent" />
          {s.eyebrow}
        </div>
        <h1 className="font-display text-[38px] leading-[1.1] font-extrabold tracking-[-1.6px] max-[599px]:text-[28px] max-[599px]:tracking-[-1.1px]">{s.title}</h1>
        <p className="m-0 mt-[9px] max-w-[640px] text-[12px] leading-[18px] text-text-3">{s.subtitle}</p>
      </header>
      <div className="grid items-start gap-6 max-[599px]:gap-4 min-[1000px]:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <div className={COLUMN}>
          <ReportCard s={s} contact={data.contact} />
          <ScopeCard s={s} sources={data.sources} addresses={data.addresses} frozenAt={data.frozenAt} />
        </div>
        <div className={COLUMN}>
          <RulesCard s={s} />
          <RewardsCard s={s} rewards={data.rewards} />
          <CheckedCard s={s} />
        </div>
      </div>
    </div>
  );
}
