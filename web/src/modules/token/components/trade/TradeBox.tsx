import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface TradeBoxProps {
  top: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  /** "pay" is the outlined input well; "receive" the quieter raised box. */
  tone?: "pay" | "receive";
}

/** The box that holds "You pay" or "You receive". */
export function TradeBox({ top, children, foot, tone = "pay" }: TradeBoxProps) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl p-3.5", tone === "pay" ? "border border-line-strong bg-bg" : "bg-raised")}>
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-[11px] text-text-3">{top}</div>
      <div className="flex items-center justify-between gap-2">{children}</div>
      {foot}
    </div>
  );
}
