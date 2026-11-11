"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { ChainId } from "@/shared/types/chain";
import { buttonClasses } from "@/shared/ui/Button";
import { ChainMark } from "@/shared/ui/ChainMark";
import { Logo } from "@/modules/shell/components/Logo";

function StateCard({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-6 pt-[55px] pb-[45px] text-center max-[699px]:px-[21px] max-[699px]:pt-[45px] max-[699px]:pb-[35px]">
      <div className="mx-auto flex size-[92px] items-center justify-center rounded-[25px] border border-accent/20 bg-accent/4 shadow-[0_0_0_12px_rgb(var(--accent-rgb)/0.025)]">
        <Logo size={39} />
      </div>
      <span className="mt-[26px] mb-2.5 block text-[10px] font-semibold tracking-[1.7px] text-accent-text uppercase">{eyebrow}</span>
      <h2 className="font-display text-[30px] leading-[1.15] font-extrabold tracking-[-1px] max-[699px]:text-[27px]">{title}</h2>
      <p className="mx-auto mt-[15px] mb-6 max-w-[450px] text-[13px] leading-[1.8] text-text-3">{body}</p>
      {children}
    </section>
  );
}

/** No wallet yet: what this screen does, and Connect on either network. */
export function ConnectState({ onConnect, pending, unavailable }: { onConnect: (chain: ChainId) => void; pending: boolean; unavailable: boolean }) {
  const { t } = useI18n();
  const c = t.portfolio.connect;
  return (
    <StateCard eyebrow={c.eyebrow} title={c.title} body={c.body}>
      <div role="group" aria-label={t.wallet.choose} className="flex flex-wrap justify-center gap-2.5">
        {(["rh", "sol"] as const).map((chain) => (
          <button key={chain} type="button" disabled={pending} onClick={() => onConnect(chain)} className={buttonClasses("secondary", "md", "gap-2 disabled:cursor-wait disabled:opacity-70")}>
            <ChainMark chain={chain} size={18} decorative />
            {fmt(t.portfolio.wallets.connectOn, { chain: CHAINS[chain].name })}
          </button>
        ))}
      </div>
      {unavailable ? (
        <p role="alert" className="m-0 mt-3 text-[12px] text-neg">
          {t.wallet.unavailable}
        </p>
      ) : null}
    </StateCard>
  );
}

/** A connected wallet that holds nothing yet. */
export function EmptyState({ onReceive }: { onReceive: () => void }) {
  const { t, href } = useI18n();
  const e = t.portfolio.empty;
  return (
    <StateCard eyebrow={e.eyebrow} title={e.title} body={e.body}>
      <Link href={href("/")} className={buttonClasses("cta", "md", "gap-7")}>
        {e.explore}
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
      </Link>
      <button type="button" aria-haspopup="dialog" onClick={onReceive} className="mx-auto mt-[13px] block py-2.5 text-[12px] text-text-3 underline decoration-line-strong underline-offset-4 hover:text-text">
        {e.receive}
      </button>
    </StateCard>
  );
}

/** Every connected network failed, and there is nothing to show. */
export function FailedState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const p = t.portfolio;
  return (
    <section role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <h2 className="font-display text-[24px] font-bold tracking-[-0.5px]">{p.failedTitle}</h2>
      <p className="m-0 max-w-[420px] text-[13px] leading-[1.7] text-text-3">{p.failedBody}</p>
      <button type="button" onClick={onRetry} className={buttonClasses("secondary", "sm")}>
        {p.retry}
      </button>
    </section>
  );
}

/** The shape of the page while the first read is out. */
export function LoadingState() {
  const { t } = useI18n();
  const block = "rounded-2xl border border-line bg-surface";
  return (
    <div role="status" aria-label={t.portfolio.loading} className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.9fr)_minmax(250px,1fr)]">
        <div className={`${block} h-[426px]`} />
        <div className={`${block} h-[426px] max-[699px]:hidden`} />
      </div>
      <div className={`${block} h-[360px]`} />
    </div>
  );
}
