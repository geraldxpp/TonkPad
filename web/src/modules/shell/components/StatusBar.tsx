import Link from "next/link";
import { getI18n } from "@/shared/i18n/server";
import { isTestnetSite, TONK_TESTNET } from "@/shared/tonk/networks";
import type { ShellData } from "../data/shell.mock";
import { LiveIndicator } from "./LiveIndicator";
import { StatusValue } from "./StatusValue";
import { SweepCountdown } from "./SweepCountdown";
import { SweepFill } from "./SweepFill";

interface StatusBarProps {
  status: ShellData["status"];
}

const VALUE = "font-mono text-text-2";
const LINK = "text-text-3 hover:text-text-2";

/** The footer: feed status, coin prices and gas, then the site links; centred like the page above it. */
export async function StatusBar({ status }: StatusBarProps) {
  const { t, href } = await getI18n();
  // Only the testnet site swaps the feed for its network's name; mainnet keeps the prices and gas.
  const testnet = isTestnetSite() ? TONK_TESTNET : null;
  return (
    <footer className="border-t border-line bg-bg-deep text-[11px] text-text-3">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 md:px-7">
        {testnet ? (
          <span>
            {testnet.name} · <span className={VALUE}>{testnet.chainId}</span>
          </span>
        ) : (
          <>
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
          </>
        )}
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
        <Link href={href("/security")} className={LINK}>
          {t.status.security}
        </Link>
        <span>© 2026 tonkfun.fun</span>
      </div>
    </footer>
  );
}
