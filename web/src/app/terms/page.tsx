import type { Metadata } from "next";
import { LaterPanel } from "@/modules/shell/components/LaterPanel";

export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return <LaterPanel title="Terms" />;
}
