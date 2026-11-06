import type { Metadata } from "next";
import { Suspense } from "react";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";

export const metadata: Metadata = { title: "Token Detail" };

async function TickerNote({ params }: Pick<PageProps<"/token/[ticker]">, "params">) {
  const { ticker } = await params;
  return (
    <>
      Token Detail for{" "}
      <span className="font-mono text-text">${decodeURIComponent(ticker).toUpperCase()}</span> is designed and
      will be built in a later module.
    </>
  );
}

export default function Page({ params }: PageProps<"/token/[ticker]">) {
  return (
    <LaterPanel title="Token Detail">
      <Suspense fallback="Token Detail is designed and will be built in a later module.">
        <TickerNote params={params} />
      </Suspense>
    </LaterPanel>
  );
}
