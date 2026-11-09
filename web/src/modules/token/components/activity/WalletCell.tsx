"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { WalletTag } from "@/shared/types/token-detail";
import { walletDot } from "../../lib/display";
import { shortAddress } from "../../lib/format";

/** The export's TAG colours, mapped to theme tokens (its violet Curve tag is the accent here). */
const TAG: Record<WalletTag, string> = {
  smart: "bg-cyan/12 text-cyan",
  sniper: "bg-warn/13 text-warn",
  whale: "bg-gold/14 text-gold",
  devLock: "bg-locked/14 text-locked",
  curve: "bg-accent/14 text-accent-text",
};

interface WalletCellProps {
  /** Full or shortened address; null is the bonding curve. */
  address: string | null;
  tag: WalletTag | null;
  className?: string;
}

/** A wallet's dot, address and tag, as every activity table shows it. */
export function WalletCell({ address, tag, className }: WalletCellProps) {
  const { t } = useI18n();
  const name = address ? shortAddress(address) : t.token.holders.curve;
  return (
    <span role="cell" className={cn("flex min-w-0 items-center gap-2", className)}>
      <span aria-hidden="true" className="size-[18px] flex-none rounded-full" style={{ background: walletDot(address ?? name) }} />
      <span title={address ?? undefined} className="truncate font-mono text-[12px]">{name}</span>
      {tag ? <span className={cn("flex-none rounded-[5px] px-1.5 py-px text-[11px] font-semibold", TAG[tag])}>{t.token.tags[tag]}</span> : null}
    </span>
  );
}
