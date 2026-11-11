import { connection } from "next/server";
import { Suspense } from "react";
import { tonkNetwork } from "@/shared/tonk/networks";
import { loadLaunchData } from "./data/get-launch-data";
import { LaunchScreen } from "./LaunchScreen";

async function LaunchContent() {
  // The launchpad's own settings are read per request, never while the page is prerendered. The demo's are fixed.
  if (tonkNetwork()) await connection();
  return <LaunchScreen data={await loadLaunchData()} />;
}

/** Module 4: Launch, the Creator Studio. The launchpad's settings load at request time behind a quiet placeholder. */
export function LaunchPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LaunchContent />
    </Suspense>
  );
}
