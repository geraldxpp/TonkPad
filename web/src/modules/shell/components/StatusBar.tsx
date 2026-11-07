import Link from "next/link";
import { getI18n } from "@/shared/i18n/server";
import type { ShellData } from "../data/shell.mock";
import { LiveIndicator } from "./LiveIndicator";
import { StatusValue } from "./StatusValue";
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
      <LiveIndicator />
      <span className="inline-flex items-center gap-2">
        {t.status.nextSweep}
        <SweepFill />
        <SweepCountdown className={VALUE} />
      </span>
      <span>
        SOL <StatusValue field="solUsd" fallback={status.solUsd} className={VALUE} />
      </span>
      <span>
        ETH <StatusValue field="ethUsd" fallback={status.ethUsd} className={VALUE} />
      </span>
      <span>
        {t.status.gas} <StatusValue field="rhGasGwei" fallback={status.rhGasGwei} className={VALUE} />
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
