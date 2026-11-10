import type { Metadata } from "next";
import { connection } from "next/server";
import { pageTitle } from "@/modules/shell/lib/meta";
import { getLiveTokenData } from "@/modules/token/data/get-live-token-data";
import { getMissionData } from "@/modules/token/data/get-mission-data";
import { getTokenData } from "@/modules/token/data/get-token-data";
import { TokenPage } from "@/modules/token/TokenPage";
import { getI18n } from "@/shared/i18n/server";
import { isLiveMode } from "@/shared/live/server";
import { isTestnetSite } from "@/shared/tonk/networks";

/** The token's name in the tab: from the chain on the testnet site, the live feed or the mock data elsewhere. */
async function tokenName(address: string): Promise<string | null> {
  if (isTestnetSite()) {
    await connection();
    const mission = await getMissionData(address);
    return mission.status === "ok" ? mission.page.mission.name : null;
  }
  if (isLiveMode()) {
    const live = await getLiveTokenData(address);
    return live.status === "ok" ? live.detail.token.name : null;
  }
  return (await getTokenData(address))?.token.name ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/token/[address]">): Promise<Metadata> {
  const [{ address }, { t }] = await Promise.all([params, getI18n()]);
  return { title: { absolute: pageTitle((await tokenName(address)) ?? t.meta.token) } };
}

export default function Page({ params }: PageProps<"/[lang]/token/[address]">) {
  return <TokenPage params={params} />;
}
