import type { Metadata } from "next";
import { LaunchPage } from "@/modules/launch/LaunchPage";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";
import { getI18n } from "@/shared/i18n/server";
import { tonkMode, tonkNetwork } from "@/shared/tonk/networks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.launch };
}

/** The Creator Studio where a launchpad network is connected (testnet, mainnet once deployed) and in the demo; "coming soon" elsewhere. */
export default async function Page() {
  if (tonkMode() === "mock" || tonkNetwork()) return <LaunchPage />;
  const { t } = await getI18n();
  return <LaterPanel title={t.meta.launch} />;
}
