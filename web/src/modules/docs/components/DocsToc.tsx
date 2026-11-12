"use client";

import { ChevronDown } from "lucide-react";
import { useRef } from "react";

interface TocItem {
  id: string;
  label: string;
}

interface DocsTocProps {
  title: string;
  items: readonly TocItem[];
}

const LINK = "block rounded-md px-2.5 py-1.5 text-[13px] leading-5 text-text-2 hover:bg-raised hover:text-text";

function Links({ items, onPick }: { items: readonly TocItem[]; onPick?: () => void }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map((item) => (
        <li key={item.id}>
          <a href={`#${item.id}`} onClick={onPick} className={LINK}>
            {item.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * The table of contents: a list that stays in place beside the sections on
 * wide screens, and a menu above them on narrower ones, which closes once a
 * section is picked. Plain anchors, so each section's link can be shared.
 */
export function DocsToc({ title, items }: DocsTocProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  return (
    <>
      <nav aria-label={title} className="sticky top-6 hidden min-[1000px]:block">
        <p className="m-0 mb-2 px-2.5 text-[10px] font-semibold tracking-[1.4px] text-text-3 uppercase">{title}</p>
        <Links items={items} />
      </nav>
      <details ref={menu} className="group min-w-0 rounded-xl border border-line bg-surface min-[1000px]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
          {title}
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className="flex-none text-text-3 transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label={title} className="border-t border-line p-2">
          <Links items={items} onPick={close} />
        </nav>
      </details>
    </>
  );
}
