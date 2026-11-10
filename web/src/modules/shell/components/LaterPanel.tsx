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
      className="relative isolate flex max-w-[640px] flex-col items-start gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-8 max-md:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(ellipse_at_100%_0%,rgb(var(--accent-rgb)/0.12),transparent_60%)]"
      />
      <span className="rounded-md border border-accent/25 bg-accent/8 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-accent-text uppercase">
        {badge ?? t.later.badge}
      </span>
      <h1 id="later-title" className="font-display text-[34px] leading-10 font-extrabold tracking-[-0.04em]">
        {title}
      </h1>
      <p className="text-[14px] leading-[22px] text-text-2">{children ?? t.later.body}</p>
      <Link href={href("/")} className={buttonClasses("secondary", "sm")}>
        {t.common.backToExplore}
      </Link>
    </section>
  );
}
