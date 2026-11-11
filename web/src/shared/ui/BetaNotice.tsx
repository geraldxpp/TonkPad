import { TriangleAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** The unaudited-beta warning on mainnet's Launch and launch-token pages (prompts/07-mainnet.md, decision 9). */
export function BetaNotice({ text, className }: { text: string; className?: string }) {
  return (
    <p role="note" className={cn("m-0 flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/7 px-3.5 py-3 text-[13px] leading-5 text-warn", className)}>
      <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
      <span className="min-w-0">{text}</span>
    </p>
  );
}
