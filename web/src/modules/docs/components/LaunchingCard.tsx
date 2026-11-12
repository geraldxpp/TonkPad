import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { DocsCard, type DocsMessages, Para, TermList, SubHeading } from "./ui";

interface LaunchingCardProps {
  d: DocsMessages;
  /** The Creator Studio's own step names. */
  steps: Dictionary["launch"]["steps"];
  /** Launch is invite-only on this site. */
  inviteOnly: boolean;
}

/** 2. Launching a token: the Creator Studio's four steps, the dev buy and the review. */
export function LaunchingCard({ d, steps, inviteOnly }: LaunchingCardProps) {
  const l = d.launching;
  return (
    <DocsCard id="launching" title={l.title}>
      {inviteOnly ? <p className="m-0 mt-3 rounded-lg border border-accent/25 bg-accent/7 px-3.5 py-3 text-[13px] leading-5 text-accent-text">{l.invite}</p> : null}
      <Para>{l.intro}</Para>
      <TermList
        items={[
          { term: steps.basics, text: l.basics },
          { term: steps.lock, text: l.lock },
          { term: steps.economics, text: l.economics },
          { term: steps.agent, text: l.agent },
        ]}
      />
      <SubHeading>{l.devBuyTitle}</SubHeading>
      <Para>{l.devBuy}</Para>
      <SubHeading>{l.reviewTitle}</SubHeading>
      <Para>{l.review}</Para>
      <Para>{l.images}</Para>
    </DocsCard>
  );
}
