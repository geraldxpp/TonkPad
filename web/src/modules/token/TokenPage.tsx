import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isLiveMode } from "@/shared/live/server";
import { getLiveTokenData } from "./data/get-live-token-data";
import { getTokenData } from "./data/get-token-data";
import { TokenLive } from "./TokenLive";
import { TokenView } from "./TokenView";

/** The token's params are known at request time; the screen streams in behind a quiet placeholder. */
async function TokenScreen({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (isLiveMode()) return <TokenLive key={address} address={address} initial={await getLiveTokenData(address)} />;
  const detail = await getTokenData(address);
  if (!detail) notFound();
  return <TokenView detail={detail} />;
}

/** Module 2: the token screen. */
export function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <TokenScreen params={params} />
    </Suspense>
  );
}
