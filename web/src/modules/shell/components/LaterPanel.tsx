import Link from "next/link";
import type { ReactNode } from "react";
import { getI18n } from "@/shared/i18n/server";
import { buttonClasses } from "@/shared/ui/Button";

interface LaterPanelProps {
  title: string;
  /** Pill above the title; defaults to "Coming in a later module". */
  badge?: string;
  children?: ReactNode;
}

/** Placeholder for screens that arrive in later modules (and the 404 page). */
export async function LaterPanel({ title, badge, children }: LaterPanelProps) {
  const { t, href } = await getI18n();
  return (
    <section
      aria-labelledby="later-title"
      className="flex max-w-[640px] flex-col items-start gap-4 rounded-[20px] border border-line bg-surface p-8 shadow-panel max-md:p-6"
    >
      <span className="rounded-full border border-line bg-raised px-3 py-1 text-[12px] font-semibold text-accent-text">
        {badge ?? t.later.badge}
      </span>
      <h1 id="later-title" className="font-display text-[32px] leading-9 font-bold tracking-[-0.015em]">
        {title}
      </h1>
      <p className="text-[15px] leading-6 text-text-2">{children ?? t.later.body}</p>
      <Link href={href("/")} className={buttonClasses("secondary", "sm")}>
        {t.common.backToExplore}
      </Link>
    </section>
  );
}
