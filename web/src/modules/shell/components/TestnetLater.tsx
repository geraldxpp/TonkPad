import Link from "next/link";
import { getI18n } from "@/shared/i18n/server";
import { buttonClasses } from "@/shared/ui/Button";

/**
 * On the testnet site, the screens that aren't connected to the testnet yet.
 * They show this instead of mock or mainnet tokens, so nothing made up sits
 * beside real testnet transactions.
 */
export async function TestnetLater({ title }: { title: string }) {
  const { t, href } = await getI18n();
  const n = t.launch.testnet;
  return (
    <section aria-labelledby="testnet-later-title" className="relative isolate flex max-w-[640px] flex-col items-start gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-8 max-md:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(ellipse_at_100%_0%,rgb(var(--accent-rgb)/0.12),transparent_60%)]" />
      <span className="rounded-md border border-warn/30 bg-warn/8 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-warn uppercase">{n.laterTitle}</span>
      <h1 id="testnet-later-title" className="font-display text-[34px] leading-10 font-extrabold tracking-[-0.04em]">
        {title}
      </h1>
      <p className="m-0 text-[14px] leading-[22px] text-text-2">{n.laterBody}</p>
      <Link href={href("/launch")} className={buttonClasses("cta", "sm")}>
        {n.openLaunch}
      </Link>
    </section>
  );
}
