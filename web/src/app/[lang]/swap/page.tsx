import type { Metadata } from "next";
import { SwapPage } from "@/modules/swap/SwapPage";
import { TestnetLater } from "@/modules/shell/components/TestnetLater";
import { getI18n } from "@/shared/i18n/server";
import { isTestnetSite } from "@/shared/tonk/networks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.swap };
}

export default async function Page() {
  if (isTestnetSite()) return <TestnetLater title={(await getI18n()).t.meta.swap} />;
  return <SwapPage />;
}
