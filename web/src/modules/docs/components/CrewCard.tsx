import { DocsCard, type DocsMessages, Para, SubHeading } from "./ui";

/**
 * 6. Crew Rewards: who earns them, the 10M-token minimum before the Crew
 * fee is charged, how holders are paid, and where the Crew's share of the
 * pool fees goes after graduation below that minimum.
 */
export function CrewCard({ d }: { d: DocsMessages }) {
  const c = d.crew;
  return (
    <DocsCard id="crew" title={c.title}>
      <Para>{c.intro}</Para>
      <Para>{c.eligible}</Para>
      <SubHeading>{c.floorTitle}</SubHeading>
      <Para>{c.floor}</Para>
      <SubHeading>{c.claimTitle}</SubHeading>
      <Para>{c.claim}</Para>
      <SubHeading>{c.afterTitle}</SubHeading>
      <Para>{c.after}</Para>
    </DocsCard>
  );
}
