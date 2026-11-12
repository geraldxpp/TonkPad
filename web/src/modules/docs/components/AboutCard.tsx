import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { DocsCard, type DocsMessages, Para, TermList } from "./ui";

interface AboutCardProps {
  d: DocsMessages;
  /** The screens' own names, as the rail shows them. */
  nav: Dictionary["nav"];
}

/** 1. What tonkfun.fun is: its five screens, one line each. */
export function AboutCard({ d, nav }: AboutCardProps) {
  const a = d.about;
  return (
    <DocsCard id="about" title={a.title}>
      <Para>{a.intro}</Para>
      <TermList
        items={[
          { term: nav.explore, text: a.explore },
          { term: nav.swap, text: a.swap },
          { term: nav.bridge, text: a.bridge },
          { term: nav.portfolio, text: a.portfolio },
          { term: nav.launch, text: a.launch },
        ]}
      />
    </DocsCard>
  );
}
