"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { WalletTag } from "@/shared/types/token-detail";
import { walletDot } from "../../lib/display";
import { shortAddress } from "../../lib/format";

/** The wallet tags in theme colours (the Curve tag is the accent). */
const TAG: Record<WalletTag, string> = {
  smart: "bg-cyan/10 text-cyan",
  sniper: "bg-warn/12 text-warn",
  whale: "bg-gold/12 text-gold",
  devLock: "bg-locked/12 text-locked",
  curve: "bg-accent/12 text-accent-text",
};

interface WalletCellProps {
  /** Full or shortened address; null is the bonding curve. */
  address: string | null;
  tag: WalletTag | null;
  className?: string;
}

/** A wallet's colour square, address and tag, as every activity table shows it. */
export function WalletCell({ address, tag, className }: WalletCellProps) {
  const { t } = useI18n();
  const name = address ? shortAddress(address) : t.token.holders.curve;
  return (
    <span role="cell" className={cn("flex min-w-0 items-center gap-2", className)}>
      <span aria-hidden="true" className="size-3.5 flex-none rounded" style={{ background: walletDot(address ?? name) }} />
      <span title={address ?? undefined} className="truncate font-mono text-[12px] text-text-2">{name}</span>
      {tag ? <span className={cn("flex-none rounded px-1.5 py-px text-[10px] font-semibold", TAG[tag])}>{t.token.tags[tag]}</span> : null}
    </span>
  );
}
