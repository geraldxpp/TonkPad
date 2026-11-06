import type { Metadata } from "next";
import { Suspense } from "react";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";
import { getI18n } from "@/shared/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.token };
}

async function TickerNote({ params, template }: Pick<PageProps<"/[lang]/token/[ticker]">, "params"> & { template: string }) {
  const { ticker } = await params;
  const [before, after] = template.split("{ticker}");
  return (
    <>
      {before}
      <span className="font-mono text-text">${decodeURIComponent(ticker).toUpperCase()}</span>
      {after}
    </>
  );
}

export default async function Page({ params }: PageProps<"/[lang]/token/[ticker]">) {
  const { t } = await getI18n();
  return (
    <LaterPanel title={t.meta.token}>
      <Suspense fallback={t.later.body}>
        <TickerNote params={params} template={t.later.token} />
      </Suspense>
    </LaterPanel>
  );
}
