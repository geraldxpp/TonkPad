import type { Metadata } from "next";
import { BridgePage } from "@/modules/bridge/BridgePage";
import { TestnetLater } from "@/modules/shell/components/TestnetLater";
import { getI18n } from "@/shared/i18n/server";
import { isTestnetSite } from "@/shared/tonk/networks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.bridge };
}

export default async function Page() {
  // The bridges only reach mainnets, so there is nothing to bridge to on the testnet site.
  if (isTestnetSite()) return <TestnetLater title={(await getI18n()).t.meta.bridge} />;
  return <BridgePage />;
}
