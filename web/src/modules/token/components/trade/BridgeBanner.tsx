"use client";

import { ArrowRight, ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";

const BANNER = "flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/6 px-3.5 py-2.5 text-left hover:bg-accent/10";

function BannerBody({ chainName }: { chainName: string }): ReactNode {
  const { t } = useI18n();
  return (
    <>
      <span className="inline-flex size-8 flex-none items-center justify-center rounded-lg bg-accent/12 text-accent-text">
        <ArrowRightLeft size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex flex-auto flex-col gap-0.5">
        <span className="text-[12px] font-semibold">{fmt(t.token.trade.bridgeTitle, { chain: chainName })}</span>
        <span className="text-[11px] text-text-2">{t.token.trade.bridgeBody}</span>
      </span>
      <ArrowRight size={16} strokeWidth={2} className="flex-none text-accent-text" aria-hidden="true" />
    </>
  );
}

/** "Need funds on Robinhood Chain?": opens the bridge dialog. The export's lime is the brand green here. */
export function BridgeBanner({ chainName, onOpen }: { chainName: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={BANNER}>
      <BannerBody chainName={chainName} />
    </button>
  );
}

/** The same banner on a live token: it opens the real Bridge, set up to land the coin here and lead back to this token. */
export function BridgeLink({ chain, chainName, coin, address }: { chain: string; chainName: string; coin: string; address: string }) {
  const { href } = useI18n();
  const query = new URLSearchParams({ to: chain, receive: coin, return: `/token/${address}` });
  return (
    <Link href={href(`/bridge?${query}`)} className={BANNER}>
      <BannerBody chainName={chainName} />
    </Link>
  );
}
