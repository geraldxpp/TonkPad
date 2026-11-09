import type { ReactNode } from "react";

/** The raised box that holds "You pay" and "You receive". */
export function TradeBox({ top, children, foot }: { top: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-raised p-4">
      <div className="flex justify-between gap-2 text-[12px] text-text-3">{top}</div>
      <div className="flex items-center justify-between gap-2">{children}</div>
      {foot}
    </div>
  );
}
