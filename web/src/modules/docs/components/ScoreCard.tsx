import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { cn } from "@/shared/lib/cn";
import type { ScoreLevel } from "@/shared/types/token";
import { Badge } from "@/shared/ui/Badge";
import { SCORE_LEVELS } from "@/shared/ui/score-levels";
import { DocsCard, type DocsMessages, Para, SubHeading } from "./ui";

interface ScoreCardProps {
  d: DocsMessages;
  /** The levels' own names, as the score pills show them. */
  levels: Dictionary["score"];
}

/** A mark beside its meaning; stacked on phones. */
function Row({ mark, children }: { mark: ReactNode; children: string }) {
  return (
    <li className="grid grid-cols-[124px_minmax(0,1fr)] items-start gap-3 text-[13px] leading-5 text-text-2 max-[599px]:grid-cols-1 max-[599px]:gap-1.5">
      <span className="flex min-w-0">{mark}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Level({ level, name }: { level: ScoreLevel; name: string }) {
  const Icon = level === "Risky" ? TriangleAlert : ShieldCheck;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-lg py-[3px] pr-2 pl-1.5 text-[12px] font-semibold", SCORE_LEVELS[level])}>
      <Icon size={13} strokeWidth={2.3} aria-hidden="true" />
      {name}
    </span>
  );
}

const LIST = "m-0 mt-3 flex list-none flex-col gap-3 p-0";

/** 8. The Mission score and badges: what Safe, Caution and Risky mean, what the score weighs, and each badge. */
export function ScoreCard({ d, levels }: ScoreCardProps) {
  const s = d.score;
  return (
    <DocsCard id="score" title={s.title}>
      <Para>{s.intro}</Para>
      <ul className={LIST}>
        <Row mark={<Level level="Safe" name={levels.Safe} />}>{s.safe}</Row>
        <Row mark={<Level level="Caution" name={levels.Caution} />}>{s.caution}</Row>
        <Row mark={<Level level="Risky" name={levels.Risky} />}>{s.risky}</Row>
      </ul>
      <SubHeading>{s.howTitle}</SubHeading>
      <Para>{s.how}</Para>
      <Para>{s.tonk}</Para>
      <SubHeading>{s.badgesTitle}</SubHeading>
      <ul className={LIST}>
        <Row mark={<Badge kind="locked" />}>{s.locked}</Row>
        <Row mark={<Badge kind="crew" value="2%" />}>{s.crew}</Row>
        <Row mark={<Badge kind="agent" />}>{s.agent}</Row>
        <Row mark={<Badge kind="hot" />}>{s.hot}</Row>
        <Row mark={<Badge kind="new" />}>{s.new}</Row>
        <Row mark={<Badge kind="graduated" />}>{s.graduated}</Row>
        <Row mark={<Badge kind="rwa" value={s.issuer} />}>{s.rwa}</Row>
        <Row mark={<Badge kind="shield" />}>{s.shield}</Row>
      </ul>
    </DocsCard>
  );
}
