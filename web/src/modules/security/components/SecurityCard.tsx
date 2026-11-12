import type { ReactNode } from "react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/** The Security page's messages, handed down from the page's getI18n(). */
export type SecurityMessages = Dictionary["security"];

interface SecurityCardProps {
  /** Ids the section's heading, so the card is a named region. */
  id: string;
  title: string;
  /** Beside the title, e.g. the freeze date. */
  aside?: ReactNode;
  children: ReactNode;
}

/** One section of the Security page: a surface card with its heading. */
export function SecurityCard({ id, title, aside, children }: SecurityCardProps) {
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-2xl border border-line bg-surface p-[22px] max-lg:p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id={`${id}-title`} className="font-display text-[18px] font-bold tracking-[-0.5px]">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A small heading inside a card. */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 text-[13px] font-semibold">{children}</h3>;
}

/** A plain list with small dots, in the card's secondary text. */
export function DotList({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[13px] leading-5 text-text-2">
          <span aria-hidden="true" className="mt-2 size-1 flex-none rounded-full bg-text-3" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
