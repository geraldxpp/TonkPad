import type { Metadata } from "next";
import { pageTitle } from "@/modules/shell/lib/meta";
import { getLiveTokenData } from "@/modules/token/data/get-live-token-data";
import { getTokenData } from "@/modules/token/data/get-token-data";
import { TokenPage } from "@/modules/token/TokenPage";
import { getI18n } from "@/shared/i18n/server";
import { isLiveMode } from "@/shared/live/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/token/[address]">): Promise<Metadata> {
  const [{ address }, { t }] = await Promise.all([params, getI18n()]);
  const live = isLiveMode() ? await getLiveTokenData(address) : null;
  const detail = live ? (live.status === "ok" ? live.detail : null) : await getTokenData(address);
  return { title: { absolute: pageTitle(detail?.token.name ?? t.meta.token) } };
}

export default function Page({ params }: PageProps<"/[lang]/token/[address]">) {
  return <TokenPage params={params} />;
}
