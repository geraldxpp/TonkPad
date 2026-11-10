"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/shared/i18n/I18nProvider";

/** Explore / name: back to the list the token came from. */
export function TokenBreadcrumb({ name }: { name: string }) {
  const { t, href } = useI18n();
  return (
    <nav aria-label={t.token.crumbs} className="flex flex-wrap items-center gap-2.5 text-[12px] text-text-3">
      <Link href={href("/")} className="inline-flex items-center gap-1 rounded-md hover:text-text">
        <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
        {t.meta.explore}
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="min-w-0 max-w-full text-text-2 [overflow-wrap:anywhere]">
        {name}
      </span>
    </nav>
  );
}
