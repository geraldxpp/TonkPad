import type { Metadata } from "next";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";

export const metadata: Metadata = { title: "Bridge" };

export default function Page() {
  return <LaterPanel title="Bridge" />;
}
