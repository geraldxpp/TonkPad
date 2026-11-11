import { Suspense } from "react";
import { PortfolioScreen } from "./PortfolioScreen";

/** Module 5: Portfolio. Everything on it depends on the visitor's wallet, so the screen is all client-side. */
export function PortfolioPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <PortfolioScreen />
    </Suspense>
  );
}
