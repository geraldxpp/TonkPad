import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getI18n } from "@/shared/i18n/server";

// Route-level not-found files can't set metadata, so the 404 title lives here.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.notFound };
}

/** Any path no other route matches renders the translated 404 (not-found.tsx). */
export default function CatchAll() {
  notFound();
}
