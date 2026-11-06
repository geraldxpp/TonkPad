import Link from "next/link";
import { getI18n } from "@/shared/i18n/server";
import { formatUsd } from "@/shared/lib/format";
import type { ShellData } from "../data/shell.mock";
import { SweepCountdown } from "./SweepCountdown";
import { SweepFill } from "./SweepFill";

interface StatusBarProps {
  status: ShellData["status"];
}

const VALUE = "font-mono text-text-2";
const LINK = "text-text-3";

export async function StatusBar({ status }: StatusBarProps) {
  const { t, href } = await getI18n();
  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-bg-deep px-[clamp(16px,2vw,24px)] py-[9px] text-[12px] text-text-3">
      <span className="inline-flex items-center gap-1.5 font-semibold text-pos">
        <span className="tk-pulse size-2 rounded-full bg-pos" />
        {t.status.live}
      </span>
      <span className="inline-flex items-center gap-2">
        {t.status.nextSweep}
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
        {t.status.gas} <span className={VALUE}>{status.rhGasGwei.toFixed(2)} gwei</span>
      </span>
      <span className="flex-auto" />
      <Link href={href("/docs")} className={LINK}>
        {t.status.docs}
      </Link>
      <Link href={href("/status")} className={LINK}>
        {t.status.status}
      </Link>
      <Link href={href("/terms")} className={LINK}>
        {t.status.terms}
      </Link>
      <span>© 2026 Tonkpad.fun</span>
    </footer>
  );
}
