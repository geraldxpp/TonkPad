import type { Metadata } from "next";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";

export const metadata: Metadata = { title: "Launch (Creator Studio)" };

export default function Page() {
  return <LaterPanel title="Launch (Creator Studio)" />;
}
