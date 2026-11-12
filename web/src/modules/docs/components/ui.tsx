import type { ReactNode } from "react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { type DocSection, titleId } from "../lib/sections";

/** The Docs page's messages, handed down from the page's getI18n(). */
export type DocsMessages = Dictionary["docs"];

/** An internal link that keeps the language: the page's href(). */
export type Href = (path: string) => string;

interface DocsCardProps {
  id: DocSection;
  title: string;
  children: ReactNode;
}

/**
 * One section of the Docs page: a surface card whose id is its anchor
 * (/docs#fees). The anchor clears the phone's sticky top bar.
 */
export function DocsCard({ id, title, children }: DocsCardProps) {
  return (
    <section id={id} aria-labelledby={titleId(id)} className="min-w-0 scroll-mt-6 rounded-2xl border border-line bg-surface p-[22px] max-lg:p-[18px] max-md:scroll-mt-[72px]">
      <h2 id={titleId(id)} className="font-display text-[18px] font-bold tracking-[-0.5px]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A small heading inside a card. */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 text-[13px] font-semibold">{children}</h3>;
}

/** A paragraph in the card's secondary text. */
export function Para({ children }: { children: ReactNode }) {
  return <p className="m-0 mt-2.5 text-[13px] leading-5 text-text-2">{children}</p>;
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

/** Terms beside their meanings, such as the five screens; stacked on phones. */
export function TermList({ items }: { items: readonly { term: string; text: string }[] }) {
  return (
    <dl className="m-0 mt-3 flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.term} className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px] leading-5 max-[599px]:grid-cols-1">
          <dt className="min-w-0 font-semibold text-text">{item.term}</dt>
          <dd className="m-0 min-w-0 text-text-2">{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}
