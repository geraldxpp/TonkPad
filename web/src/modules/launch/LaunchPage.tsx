import { Suspense } from "react";
import { loadLaunchData } from "./data/get-launch-data";
import { LaunchScreen } from "./LaunchScreen";

async function LaunchContent() {
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
