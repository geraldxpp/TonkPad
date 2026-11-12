import type { Metadata } from "next";
import { DocsPage } from "@/modules/docs/DocsPage";
import { getI18n } from "@/shared/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.docs };
}

export default function Page() {
  return <DocsPage />;
}
