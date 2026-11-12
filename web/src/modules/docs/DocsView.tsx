import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { AboutCard } from "./components/AboutCard";
import { CrewCard } from "./components/CrewCard";
import { CurveCard } from "./components/CurveCard";
import { DocsLiveProvider } from "./components/DocsLive";
import { DocsToc } from "./components/DocsToc";
import { FaqCard } from "./components/FaqCard";
import { FeesCard } from "./components/FeesCard";
import { LaunchingCard } from "./components/LaunchingCard";
import { LocksCard } from "./components/LocksCard";
import { SafetyCard } from "./components/SafetyCard";
import { ScoreCard } from "./components/ScoreCard";
import { TaxCard } from "./components/TaxCard";
import type { Href } from "./components/ui";
import type { DocsData } from "./data/get-docs-data";
import { DOC_SECTIONS } from "./lib/sections";

interface DocsViewProps {
  t: Dictionary;
  href: Href;
  data: DocsData;
}

/**
 * The Docs page: its sections as cards in one column, with a table of
 * contents that stays in place beside them on wide screens and is a menu
 * above them on narrower ones. One read of the launchpad feeds every live figure.
 */
export function DocsView({ t, href, data }: DocsViewProps) {
  const d = t.docs;
  const toc = DOC_SECTIONS.map((id) => ({ id, label: d[id].title }));
  return (
    <div className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col">
      <header className="mb-[30px] max-[599px]:mb-[22px]">
        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold tracking-[1.7px] text-accent-text uppercase">
          <span aria-hidden="true" className="block h-px w-[22px] bg-accent" />
          {d.eyebrow}
        </div>
        <h1 className="font-display text-[38px] leading-[1.1] font-extrabold tracking-[-1.6px] max-[599px]:text-[28px] max-[599px]:tracking-[-1.1px]">{d.title}</h1>
        <p className="m-0 mt-[9px] max-w-[640px] text-[12px] leading-[18px] text-text-3">{d.subtitle}</p>
        {data.mode === "testnet" ? <p className="m-0 mt-4 max-w-[640px] rounded-lg border border-warn/25 bg-warn/7 px-3.5 py-3 text-[13px] leading-5 text-warn">{d.testnetNote}</p> : null}
      </header>
      <DocsLiveProvider data={data}>
        <div className="grid items-start gap-6 max-[599px]:gap-4 min-[1000px]:grid-cols-[200px_minmax(0,1fr)] min-[1000px]:gap-10">
          <DocsToc title={d.toc} items={toc} />
          <div className="flex min-w-0 flex-col gap-6 max-[599px]:gap-4">
            <AboutCard d={d} nav={t.nav} />
            <LaunchingCard d={d} steps={t.launch.steps} inviteOnly={data.inviteOnly} />
            <CurveCard d={d} />
            <FeesCard d={d} />
            <LocksCard d={d} kinds={t.launch.lock} />
            <CrewCard d={d} />
            <TaxCard d={d} />
            <ScoreCard d={d} levels={t.score} />
            <SafetyCard d={d} href={href} contracts={data.contracts} inviteOnly={data.inviteOnly} />
            <FaqCard d={d} />
          </div>
        </div>
      </DocsLiveProvider>
    </div>
  );
}
