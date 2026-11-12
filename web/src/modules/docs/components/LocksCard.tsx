import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { Badge } from "@/shared/ui/Badge";
import { DocsCard, type DocsMessages, Para, TermList, SubHeading } from "./ui";

interface LocksCardProps {
  d: DocsMessages;
  /** The Creator Studio's own names for the three kinds of lock. */
  kinds: Pick<Dictionary["launch"]["lock"], "time" | "linear" | "none">;
}

/** 5. Locks: time-lock, linear vesting or none; extending (never shortening); and the Locked badge. */
export function LocksCard({ d, kinds }: LocksCardProps) {
  const l = d.locks;
  return (
    <DocsCard id="locks" title={l.title}>
      <Para>{l.intro}</Para>
      <TermList
        items={[
          { term: kinds.time, text: l.time },
          { term: kinds.linear, text: l.linear },
          { term: kinds.none, text: l.none },
        ]}
      />
      <Para>{l.rules}</Para>
      <Para>{l.claim}</Para>
      <SubHeading>{l.extendTitle}</SubHeading>
      <Para>{l.extend}</Para>
      <Para>{l.extendVest}</Para>
      <SubHeading>{l.badgeTitle}</SubHeading>
      <div className="mt-2.5 flex items-start gap-3">
        <span className="flex-none">
          <Badge kind="locked" />
        </span>
        <p className="m-0 min-w-0 text-[13px] leading-5 text-text-2">{l.badge}</p>
      </div>
    </DocsCard>
  );
}
