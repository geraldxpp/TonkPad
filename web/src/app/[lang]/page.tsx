import type { Metadata } from "next";
import { ExplorePage } from "@/modules/explore/ExplorePage";
import { pageTitle } from "@/modules/shell/lib/meta";
import { getI18n } from "@/shared/i18n/server";

// The layout's title template only reaches child segments, and this page shares the layout's.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: pageTitle(t.meta.explore) } };
}

export default function Page({ searchParams }: PageProps<"/[lang]">) {
  return <ExplorePage searchParams={searchParams} />;
}
