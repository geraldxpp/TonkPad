import Link from "next/link";
import { formatUsd } from "@/shared/lib/format";
import type { ShellData } from "../data/shell.mock";
import { SweepCountdown } from "./SweepCountdown";
import { SweepFill } from "./SweepFill";

interface StatusBarProps {
  status: ShellData["status"];
}

const VALUE = "font-mono text-text-2";
const LINK = "text-text-3";

export function StatusBar({ status }: StatusBarProps) {
  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-bg-deep px-[clamp(16px,2vw,24px)] py-[9px] text-[12px] text-text-3">
      <span className="inline-flex items-center gap-1.5 font-semibold text-pos">
        <span className="tk-pulse size-2 rounded-full bg-pos" />
        Live
      </span>
      <span className="inline-flex items-center gap-2">
        Next sweep
        <SweepFill />
        <SweepCountdown className={VALUE} />
      </span>
      <span>
        SOL <span className={VALUE}>{formatUsd(status.solUsd)}</span>
      </span>
      <span>
        ETH <span className={VALUE}>{formatUsd(status.ethUsd, 0)}</span>
      </span>
      <span>
        Robinhood Chain gas <span className={VALUE}>{status.rhGasGwei.toFixed(2)} gwei</span>
      </span>
      <span className="flex-auto" />
      <Link href="/docs" className={LINK}>
        Docs
      </Link>
      <Link href="/status" className={LINK}>
        Status
      </Link>
      <Link href="/terms" className={LINK}>
        Terms
      </Link>
      <span>© 2026 Tonkpad.fun</span>
    </footer>
  );
}
