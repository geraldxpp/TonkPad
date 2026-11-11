import type { Metadata } from "next";
import { SecurityPage } from "@/modules/security/SecurityPage";
import { getI18n } from "@/shared/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.security };
}

export default function Page() {
  return <SecurityPage />;
}
