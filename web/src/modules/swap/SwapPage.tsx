import { Suspense } from "react";
import { getSwapData } from "./data/get-swap-data";
import { SwapScreen } from "./SwapScreen";

async function SwapContent() {
  return <SwapScreen data={await getSwapData()} />;
}

/** Module 3: Swap. Its trending tokens load at request time behind a quiet placeholder. */
export function SwapPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <SwapContent />
    </Suspense>
  );
}
