import { Target, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatPrice, formatUsdCompact } from "@/shared/lib/format";
import type { Token } from "@/shared/types/token";
import { Badge } from "@/shared/ui/Badge";
import { buttonClasses } from "@/shared/ui/Button";
import { ChainMark } from "@/shared/ui/ChainMark";
import { ScorePill } from "@/shared/ui/ScorePill";

interface MissionPickProps {
  token: Token;
  price: number;
  updatedSecondsAgo: number;
}

function Figure({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-text-3">{label}</span>
      <span className={cn("font-mono text-[14px] font-semibold", positive && "text-pos")}>{value}</span>
    </div>
  );
}

/** The hero's featured token, with a one-tap Buy into its detail page. */
export function MissionPick({ token, price, updatedSecondsAgo }: MissionPickProps) {
  const href = `/token/${token.ticker}`;
  const { flags } = token;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-surface p-3.5">
      <Image src={token.art} alt="" width={52} height={52} loading="eager" className="size-[52px] flex-none rounded-[15px]" />
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-accent-text">
          <Target size={13} strokeWidth={2} />
          MISSION PICK
          <span className="font-normal tracking-normal text-text-3">· updated {updatedSecondsAgo}s ago</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Link href={href} className="text-[17px] font-semibold text-text">
            {token.name}
          </Link>
          <span className="font-mono text-[12px] text-text-3">${token.ticker}</span>
          <ChainMark chain={token.chain} size={16} letterSize={8} />
          <ScorePill score={token.score} level={token.level} variant="inline" />
          {flags.locked ? <Badge kind="locked" /> : null}
          {flags.crew ? <Badge kind="crew" value={flags.crew} /> : null}
          {flags.agent ? <Badge kind="agent" /> : null}
        </div>
      </div>
      {/* Phones: a three-column figure row and a full-width Buy, like a featured card. */}
      <div className="flex flex-wrap items-center gap-5 max-md:grid max-md:basis-full max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-4 max-md:border-t max-md:border-line max-md:pt-3.5">
        <Figure label="Price" value={formatPrice(price)} />
        <Figure label="Mkt cap" value={formatUsdCompact(token.marketCap)} />
        <Figure label="24h" value={formatChange(token.change24h)} positive={token.change24h >= 0} />
        <Link
          href={href}
          aria-label={`Buy ${token.name}`}
          className={buttonClasses("buy", "lg", "max-md:col-span-3 max-md:h-12 max-md:w-full")}
        >
          <Zap size={16} fill="currentColor" stroke="none" />
          Buy<span className="md:hidden"> {token.name}</span>
        </Link>
      </div>
    </div>
  );
}
