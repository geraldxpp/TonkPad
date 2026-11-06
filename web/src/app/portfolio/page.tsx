import type { Metadata } from "next";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";

export const metadata: Metadata = { title: "Portfolio" };

export default function Page() {
  return <LaterPanel title="Portfolio" />;
}
