import type { Metadata } from "next";
import { LaunchPage } from "@/modules/launch/LaunchPage";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";
import { getI18n } from "@/shared/i18n/server";
import { tonkMode } from "@/shared/tonk/networks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.launch };
}

/** The Creator Studio where a launchpad network is connected (the testnet site, and the demo); "coming soon" elsewhere. */
export default async function Page() {
  if (tonkMode() !== "off") return <LaunchPage />;
  const { t } = await getI18n();
  return <LaterPanel title={t.meta.launch} />;
}
