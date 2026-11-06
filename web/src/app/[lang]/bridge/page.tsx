import type { Metadata } from "next";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";
import { getI18n } from "@/shared/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.bridge };
}

export default async function Page() {
  const { t } = await getI18n();
  return <LaterPanel title={t.meta.bridge} />;
}
