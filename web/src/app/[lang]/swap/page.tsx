import type { Metadata } from "next";
import { SwapPage } from "@/modules/swap/SwapPage";
import { getI18n } from "@/shared/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.swap };
}

export default function Page() {
  return <SwapPage />;
}
