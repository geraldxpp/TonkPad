import type { Metadata } from "next";
import { PrivacyPage } from "@/modules/privacy/PrivacyPage";
import { getI18n } from "@/shared/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.privacy };
}

export default function Page() {
  return <PrivacyPage />;
}
