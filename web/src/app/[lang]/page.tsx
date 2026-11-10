import type { Metadata } from "next";
import { ExplorePage } from "@/modules/explore/ExplorePage";
import { pageTitle } from "@/modules/shell/lib/meta";
import { TestnetLater } from "@/modules/shell/components/TestnetLater";
import { getI18n } from "@/shared/i18n/server";
import { isTestnetSite } from "@/shared/tonk/networks";

// The layout's title template only reaches child segments, and this page shares the layout's.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: pageTitle(t.meta.explore) } };
}

export default async function Page({ searchParams }: PageProps<"/[lang]">) {
  if (isTestnetSite()) return <TestnetLater title={(await getI18n()).t.meta.explore} />;
  return <ExplorePage searchParams={searchParams} />;
}
