import type { Metadata } from "next";
import { TestnetLater } from "@/modules/shell/components/TestnetLater";
import { PortfolioPage } from "@/modules/portfolio/PortfolioPage";
import { getI18n } from "@/shared/i18n/server";
import { isTestnetSite } from "@/shared/tonk/networks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.portfolio };
}

export default async function Page() {
  // The testnet's tokens have no market to price them, so there is no portfolio to add up there yet.
  if (isTestnetSite()) return <TestnetLater title={(await getI18n()).t.meta.portfolio} />;
  return <PortfolioPage />;
}
