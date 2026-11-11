import { Suspense } from "react";
import { BridgeScreen } from "./BridgeScreen";

/** Module 6: Bridge. The route lives in the URL and everything on it depends on the visitor's wallet, so the screen is all client-side. */
export function BridgePage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <BridgeScreen />
    </Suspense>
  );
}
