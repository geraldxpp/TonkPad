"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/shared/i18n/I18nProvider";

/** Explore / Trending / name: back to the list the token came from (Explore opens on Trending). */
export function TokenBreadcrumb({ name }: { name: string }) {
  const { t, href } = useI18n();
  return (
    <nav aria-label={t.token.crumbs} className="flex flex-wrap items-center gap-2 text-[12px] text-text-3">
      <Link href={href("/")} className="inline-flex items-center gap-1.5 text-text-3">
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        {t.meta.explore}
      </Link>
      <span aria-hidden="true">/</span>
      <Link href={href("/")} className="text-text-3">
        {t.tabs.trending}
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="min-w-0 max-w-full font-semibold text-text [overflow-wrap:anywhere]">
        {name}
      </span>
    </nav>
  );
}
